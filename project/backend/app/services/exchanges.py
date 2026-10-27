"""Transactional exchange workflow. READY is consent, never settlement."""

import uuid
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import AuditLog, User, UserStatus, Role
from app.db.models.exchange import ExchangeMatch, ExchangeMatchStatus as MS, ExchangeRequest, ExchangeRequestStatus as RS, ExchangeSettlement
from app.schemas.exchange import CreateExchangeRequest
from app.services import audit
from app.services.exchange_ticketing import TicketingGateway

ACTIVE_REQUESTS = (RS.OPEN, RS.MATCHED)
ACTIVE_MATCHES = (MS.PENDING, MS.READY)


def fail(code="EXCHANGE_CONFLICT", message="this exchange has changed or is no longer available", status=409):
    raise AppError(status, code, message)


def request_view(r: ExchangeRequest) -> dict:
    s = r.ticket_snapshot
    return {"id": r.id, "requester_user_id": r.requester_user_id, "offered_ticket_id": r.offered_ticket_id,
            "event_id": s["event_id"], "event_name": s["event_name"],
            "offered_category_type": s["category_type"], "offered_seat_section": s["seat_section"],
            "desired_category_type": r.desired_category_type, "desired_seat_section": r.desired_seat_section,
            "allow_cross_tier": r.allow_cross_tier, "request_type": r.request_type,
            "status": r.status, "expires_at": r.expires_at, "created_at": r.created_at,
            "desired_category_id": s.get("desired_category_id")}


def listing_view(r: ExchangeRequest) -> dict:
    view = request_view(r)
    return {"request_id": r.id, "offered_seat_label": r.ticket_snapshot.get("seat_label"),
            "offered_price": r.ticket_snapshot["price"], **{k: v for k, v in view.items() if k not in
            ("id", "requester_user_id", "request_type", "status", "created_at")}}


def _lock_requests(db: Session, ids: list[uuid.UUID]) -> list[ExchangeRequest]:
    return list(db.scalars(select(ExchangeRequest).where(ExchangeRequest.id.in_(ids))
                          .order_by(ExchangeRequest.id).with_for_update().execution_options(populate_existing=True)))


def _own(db: Session, user: User, request_id: uuid.UUID) -> ExchangeRequest:
    r = db.get(ExchangeRequest, request_id)
    if r is None or r.requester_user_id != user.id:
        fail("EXCHANGE_NOT_FOUND", "exchange request not found", 404)
    return r


def _match(db: Session, user: User, match_id: uuid.UUID, *, lock=False) -> tuple[ExchangeMatch, list[ExchangeRequest]]:
    m = db.get(ExchangeMatch, match_id)
    if m is None:
        fail("MATCH_NOT_FOUND", "exchange match not found", 404)
    requests = list(db.scalars(select(ExchangeRequest).where(ExchangeRequest.id.in_([m.request_a_id, m.request_b_id]))))
    if user.id not in [r.requester_user_id for r in requests]:
        fail("MATCH_NOT_FOUND", "exchange match not found", 404)
    if lock:
        requests = _lock_requests(db, [m.request_a_id, m.request_b_id])
        m = db.scalar(select(ExchangeMatch).where(ExchangeMatch.id == match_id).with_for_update()
                      .execution_options(populate_existing=True))
    return m, requests


def _record(db, entity, before, actor=None):
    audit.record(db, actor=actor, action=f"EXCHANGE_{entity.status.value}",
                 entity_type="ExchangeMatch" if isinstance(entity, ExchangeMatch) else "ExchangeRequest",
                 entity_id=entity.id, before={"status": before} if before else None,
                 after={"status": entity.status.value, "reason": entity.closed_reason})


def _state(db, entity, status, reason=None, actor=None):
    before = entity.status.value
    entity.status, entity.closed_reason = status, reason
    _record(db, entity, before, actor)


def _live(gateway: TicketingGateway, db, requests, now, *, lock=False) -> dict[uuid.UUID, bool]:
    contexts = gateway.load(db, [r.offered_ticket_id for r in requests if r.ticketing_source == gateway.source], now, lock=lock)
    live = {}
    for r in requests:
        t = contexts.get(r.offered_ticket_id)
        live[r.id] = bool(t and r.ticketing_source == gateway.source and t.eligible
                          and t.owner_user_id == r.requester_user_id and t.revision == r.ticket_revision)
        # Older offers predate category IDs in snapshots. Resolve them only
        # from unchanged live tickets, so new ID preferences can match safely.
        if live[r.id] and t.category_id and not r.ticket_snapshot.get("category_id"):
            r.ticket_snapshot = {**r.ticket_snapshot, "category_id": t.category_id}
    return live


def _close_match(db, m, requests, live, now, status, reason, actor=None):
    _state(db, m, status, reason, actor)
    for r in requests:
        if r.status != RS.MATCHED:
            continue
        if r.expires_at <= now:
            _state(db, r, RS.EXPIRED, "REQUEST_EXPIRED", actor)
        elif not live[r.id]:
            _state(db, r, RS.CANCELLED, "TICKETING_CHANGED", actor)
        elif r.ticket_snapshot.get("interest_target_request_id"):
            # An interest response is private to this match, never a new listing
            # or an invitation to reopen after rejection/cancellation/expiry.
            _state(db, r, RS.CANCELLED, "INTEREST_CLOSED", actor)
        else:
            _state(db, r, RS.OPEN, actor=actor)


def _refresh_locked(db, gateway, requests, m=None):
    now = utcnow()
    live = _live(gateway, db, requests, now, lock=True)
    if m and m.status in ACTIVE_MATCHES:
        expired = m.expires_at <= now or any(r.expires_at <= now for r in requests)
        if expired or not all(live.values()):
            _close_match(db, m, requests, live, now, MS.EXPIRED if expired else MS.CANCELLED,
                         "MATCH_EXPIRED" if expired else "TICKETING_CHANGED")
    else:
        for r in requests:
            if r.status == RS.OPEN:
                if r.expires_at <= now:
                    _state(db, r, RS.EXPIRED, "REQUEST_EXPIRED")
                elif not live[r.id]:
                    _state(db, r, RS.CANCELLED, "TICKETING_CHANGED")
    db.flush()
    return live


def refresh(db: Session, gateway: TicketingGateway, request_ids=None) -> None:
    """Reconcile with B, one workflow per transaction. Safe on several workers."""
    stmt = select(ExchangeRequest.id).where(ExchangeRequest.status.in_(ACTIVE_REQUESTS)).order_by(ExchangeRequest.id)
    if request_ids is not None:
        stmt = stmt.where(ExchangeRequest.id.in_(request_ids))
    ids = list(db.scalars(stmt))
    db.commit()
    for request_id in ids:
        r = db.get(ExchangeRequest, request_id)
        # Discover immutable participant IDs before taking locks; every operation
        # locks request rows in UUID order, then match, then ticketing rows.
        m = db.scalar(select(ExchangeMatch).where(
            or_(ExchangeMatch.request_a_id == request_id, ExchangeMatch.request_b_id == request_id),
            ExchangeMatch.status.in_(ACTIVE_MATCHES)))
        requests = _lock_requests(db, [m.request_a_id, m.request_b_id] if m else [r.id])
        if m:
            m = db.scalar(select(ExchangeMatch).where(ExchangeMatch.id == m.id).with_for_update()
                          .execution_options(populate_existing=True))
        # A match may have been created while this worker waited for a request.
        # Retry on the next pass instead of locking its peer out of order.
        if not m and any(r.status == RS.MATCHED for r in requests):
            db.rollback()
            continue
        _refresh_locked(db, gateway, requests, m)
        db.commit()


def owned_request_ids(db, user):
    return list(db.scalars(select(ExchangeRequest.id).where(ExchangeRequest.requester_user_id == user.id)))


def ticket_request_ids(db, gateway, ticket_ids):
    return list(db.scalars(select(ExchangeRequest.id).where(
        ExchangeRequest.ticketing_source == gateway.source,
        ExchangeRequest.offered_ticket_id.in_(ticket_ids), ExchangeRequest.status.in_(ACTIVE_REQUESTS))))


def eligible_tickets(db, gateway, user):
    tickets = gateway.owned(db, user.id, utcnow())
    # Reconcile former owners' offers too, even with the background job disabled.
    refresh(db, gateway, owned_request_ids(db, user) + ticket_request_ids(db, gateway, [t.id for t in tickets]))
    reserved = set(db.scalars(select(ExchangeRequest.offered_ticket_id).where(
        ExchangeRequest.ticketing_source == gateway.source, ExchangeRequest.status.in_(ACTIVE_REQUESTS))))
    return [{**t.snapshot(), "status": t.status, "eligible": t.eligible and t.id not in reserved}
            for t in gateway.owned(db, user.id, utcnow())]


def create(db, gateway, settings: Settings, user, data: CreateExchangeRequest):
    refresh(db, gateway, owned_request_ids(db, user) + ticket_request_ids(db, gateway, [data.offered_ticket_id]))
    now = utcnow()
    t = gateway.load(db, [data.offered_ticket_id], now, lock=True).get(data.offered_ticket_id)
    if not t or t.owner_user_id != user.id:
        fail("TICKET_NOT_FOUND", "ticket not found", 404)
    if not t.eligible:
        fail("TICKET_INELIGIBLE", "this ticket cannot be offered for exchange")
    has_preferences = bool(data.desired_category_id or data.desired_category_type or data.desired_seat_section)
    options = gateway.preferences(db, t.event_id) if has_preferences else []
    choices = [c for c in options if (not data.desired_category_id or c["id"] == str(data.desired_category_id))
               and (not data.desired_category_type or c["type"].casefold() == data.desired_category_type.casefold())]
    if (has_preferences and not choices) or (data.desired_seat_section and not any(
            data.desired_seat_section.casefold() == section.casefold() for c in choices for section in c["sections"])):
        fail("INVALID_PREFERENCE", "choose a category and section from this event", 422)
    if data.desired_category_id:
        data.desired_category_type = choices[0]["type"]
    if data.desired_category_type and not data.allow_cross_tier and data.desired_category_type.casefold() != t.category_type.casefold():
        fail("CROSS_TIER_DISABLED", "enable cross-tier exchange to request another category", 422)
    if db.scalar(select(ExchangeRequest.id).where(ExchangeRequest.ticketing_source == gateway.source,
                  ExchangeRequest.offered_ticket_id == t.id, ExchangeRequest.status.in_(ACTIVE_REQUESTS))):
        fail("TICKET_RESERVED", "this ticket already has an active exchange request")
    recipient = None
    if data.request_type == "DIRECT":
        recipient = db.scalar(select(User).where(User.username == data.recipient_username.lower(),
                                                User.role == Role.CUSTOMER, User.status == UserStatus.ACTIVE))
        if not recipient or recipient.id == user.id:
            fail("INVALID_RECIPIENT", "choose another active customer username", 422)
    r = ExchangeRequest(recipient_user_id=recipient.id if recipient else None, requester_user_id=user.id, ticketing_source=t.source, offered_ticket_id=t.id,
                        ticket_snapshot={**t.snapshot(), "desired_category_id": str(data.desired_category_id) if data.desired_category_id else None}, ticket_revision=t.revision,
                        desired_category_type=data.desired_category_type, desired_seat_section=data.desired_seat_section,
                        allow_cross_tier=data.allow_cross_tier, request_type=data.request_type, status=RS.OPEN,
                        created_at=now, expires_at=min(t.event_start_at, now + timedelta(hours=settings.EXCHANGE_REQUEST_TTL_HOURS)))
    db.add(r)
    db.flush()
    _record(db, r, None, user)
    db.commit()
    return request_view(r)


def compatible(a: ExchangeRequest, b: ExchangeRequest) -> bool:
    if a.id == b.id or a.requester_user_id == b.requester_user_id or a.ticketing_source != b.ticketing_source:
        return False
    if (a.request_type == "DIRECT" and a.recipient_user_id != b.requester_user_id) or (b.request_type == "DIRECT" and b.recipient_user_id != a.requester_user_id):
        return False
    x, y = a.ticket_snapshot, b.ticket_snapshot
    if x["event_id"] != y["event_id"]:
        return False
    for r, own, other in ((a, x, y), (b, y, x)):
        if own.get("desired_category_id") and own["desired_category_id"] != other.get("category_id"):
            return False
        if not r.allow_cross_tier and own["category_type"].casefold() != other["category_type"].casefold():
            return False
        if r.desired_category_type and r.desired_category_type.casefold() != other["category_type"].casefold():
            return False
        if r.desired_seat_section and r.desired_seat_section.casefold() != other["seat_section"].casefold():
            return False
    return True


def preference_options(db, gateway, user, ticket_id):
    t = gateway.load(db, [ticket_id], utcnow()).get(ticket_id)
    if not t or t.owner_user_id != user.id:
        fail("TICKET_NOT_FOUND", "ticket not found", 404)
    if not t.eligible:
        fail("TICKET_INELIGIBLE", "this ticket cannot be offered for exchange")
    return gateway.preferences(db, t.event_id)


def activity(db, gateway, user):
    """Project existing durable audit events into participant-only activity.

    Never return raw audit records, actors, recipient usernames or QR values.
    No notification table or schema migration is needed.
    """
    refresh(db, gateway, owned_request_ids(db, user))
    requests = list(db.scalars(select(ExchangeRequest).where(or_(
        ExchangeRequest.requester_user_id == user.id, ExchangeRequest.recipient_user_id == user.id))))
    own_ids = [r.id for r in requests if r.requester_user_id == user.id]
    matches = list(db.scalars(select(ExchangeMatch).where(or_(
        ExchangeMatch.request_a_id.in_(own_ids), ExchangeMatch.request_b_id.in_(own_ids)))))
    request_map = {str(r.id): r for r in requests}
    match_map = {str(m.id): m for m in matches}
    events = db.scalars(select(AuditLog).where(or_(
        and_(AuditLog.entity_type == "ExchangeRequest", AuditLog.entity_id.in_(request_map)),
        and_(AuditLog.entity_type == "ExchangeMatch", AuditLog.entity_id.in_(match_map))))
        .order_by(AuditLog.created_at.desc(), AuditLog.id).limit(100)).all()
    return [{"id": e.id, "action": e.action, "created_at": e.created_at,
             "match_id": e.entity_id if e.entity_type == "ExchangeMatch" else None,
             "request_id": e.entity_id if e.entity_type == "ExchangeRequest" else None,
             "event_name": (match_map[e.entity_id].ticket_a["event_name"] if e.entity_type == "ExchangeMatch"
                            else request_map[e.entity_id].ticket_snapshot["event_name"]),
             "own_action": e.actor_user_id == user.id} for e in events
            if e.entity_type == "ExchangeMatch" or e.action not in ("EXCHANGE_MATCHED", "EXCHANGE_COMPLETED")]


def listings(db, gateway, own=None, recipient=None):
    now = utcnow()
    rows = list(db.scalars(select(ExchangeRequest).where(ExchangeRequest.status == RS.OPEN,
                          ExchangeRequest.expires_at > now, ExchangeRequest.ticketing_source == gateway.source)
                          .order_by(ExchangeRequest.created_at.desc(), ExchangeRequest.id)))
    if recipient is not None:
        rows = [r for r in rows if r.request_type == "DIRECT" and r.recipient_user_id == recipient.id]
    elif own is None:
        rows = [r for r in rows if r.request_type == "PUBLIC"]
    live = _live(gateway, db, rows, now)
    return [listing_view(r) for r in rows if live[r.id] and (own is None or compatible(own, r))]


def suggestions(db, gateway, user, request_id):
    _own(db, user, request_id)
    refresh(db, gateway, [request_id])
    r = _own(db, user, request_id)
    if r.status != RS.OPEN:
        fail()
    return listings(db, gateway, own=r)


def interest(db, gateway, settings, user, request_id, target_id):
    _own(db, user, request_id)
    refresh(db, gateway, [request_id, target_id])
    requests = _lock_requests(db, [request_id, target_id])
    by_id = {r.id: r for r in requests}
    a, b = by_id.get(request_id), by_id.get(target_id)
    if a is None or a.requester_user_id != user.id or b is None or (b.request_type == "DIRECT" and b.recipient_user_id != user.id):
        fail("EXCHANGE_NOT_FOUND", "exchange request not found", 404)
    if a.status != RS.OPEN or b.status != RS.OPEN or not compatible(a, b):
        fail("INCOMPATIBLE_EXCHANGE", "these requests are unavailable or incompatible")
    _refresh_locked(db, gateway, requests)
    if any(r.status != RS.OPEN for r in requests):
        db.commit()  # Persist invalidation even when the attempted action fails.
        fail()
    now = utcnow()
    m = ExchangeMatch(request_a_id=a.id, request_b_id=b.id, ticket_a=a.ticket_snapshot, ticket_b=b.ticket_snapshot,
                      a_accepted=False, b_accepted=False, status=MS.PENDING,
                      expires_at=min(a.expires_at, b.expires_at, now + timedelta(minutes=settings.EXCHANGE_MATCH_TTL_MINUTES)))
    db.add(m)
    for r in requests:
        _state(db, r, RS.MATCHED, actor=user)
    db.flush()
    _record(db, m, None, user)
    db.commit()
    return m


def _interest_target(db, gateway, user, target_id):
    target = db.get(ExchangeRequest, target_id)
    # A private invitation may be answered only by its named recipient.
    if (target is None or target.requester_user_id == user.id
            or (target.request_type == "DIRECT" and target.recipient_user_id != user.id)):
        fail("EXCHANGE_NOT_FOUND", "exchange request not found", 404)
    if target.status != RS.OPEN or target.expires_at <= utcnow():
        fail()
    if not _live(gateway, db, [target], utcnow())[target.id]:
        fail()
    return target


def _interest_response(target, ticket, user, settings, now):
    # Reuse the existing request/consent schema as a private response. No new
    # Ticket is created, and no standalone public request is required from B.
    return ExchangeRequest(
        id=uuid.uuid4(), requester_user_id=user.id, recipient_user_id=target.requester_user_id,
        ticketing_source=ticket.source, offered_ticket_id=ticket.id,
        ticket_snapshot={**ticket.snapshot(), "interest_target_request_id": str(target.id)},
        ticket_revision=ticket.revision,
        desired_category_type=target.ticket_snapshot["category_type"],
        desired_seat_section=target.ticket_snapshot["seat_section"],
        allow_cross_tier=target.allow_cross_tier, request_type="DIRECT", status=RS.MATCHED,
        created_at=now,
        expires_at=min(target.expires_at, ticket.event_start_at,
                       now + timedelta(hours=settings.EXCHANGE_REQUEST_TTL_HOURS)),
    )


def interest_tickets(db, gateway, settings, user, target_id):
    _interest_target(db, gateway, user, target_id)
    eligible = eligible_tickets(db, gateway, user)
    target = _interest_target(db, gateway, user, target_id)
    contexts = gateway.load(db, [t["id"] for t in eligible if t["eligible"]], utcnow())
    return [{**ticket.snapshot(), "status": ticket.status, "eligible": True}
            for ticket in contexts.values()
            if ticket.eligible and ticket.owner_user_id == user.id
            and compatible(target, _interest_response(target, ticket, user, settings, utcnow()))]


def ticket_interest(db, gateway, settings, user, target_id, offered_ticket_id):
    _interest_target(db, gateway, user, target_id)
    refresh(db, gateway, [target_id] + ticket_request_ids(db, gateway, [offered_ticket_id]))
    targets = _lock_requests(db, [target_id])
    if not targets:
        fail("EXCHANGE_NOT_FOUND", "public exchange request not found", 404)
    target = _interest_target(db, gateway, user, target_id)
    # Lock both bookings/tickets together in the gateway's fixed order, then
    # recheck ownership, revisions, eligibility, expiry and competing requests.
    ticket_ids = [target.offered_ticket_id, offered_ticket_id]
    gateway.load(db, ticket_ids, utcnow(), lock=True)
    now = utcnow()
    contexts = gateway.load(db, ticket_ids, now)
    offered = contexts.get(offered_ticket_id)
    if offered is None or offered.owner_user_id != user.id:
        fail("TICKET_NOT_FOUND", "ticket not found", 404)
    if not offered.eligible:
        fail("TICKET_INELIGIBLE", "this ticket cannot be offered for exchange")
    _refresh_locked(db, gateway, [target])
    if target.status != RS.OPEN:
        db.commit()
        fail()
    if db.scalar(select(ExchangeRequest.id).where(
            ExchangeRequest.ticketing_source == gateway.source,
            ExchangeRequest.offered_ticket_id == offered.id,
            ExchangeRequest.status.in_(ACTIVE_REQUESTS))):
        fail("TICKET_RESERVED", "this ticket already has an active exchange request")
    response = _interest_response(target, offered, user, settings, now)
    if not compatible(target, response):
        fail("INCOMPATIBLE_EXCHANGE", "this ticket is not compatible with the public request")
    match = ExchangeMatch(
        request_a_id=target.id, request_b_id=response.id,
        ticket_a=target.ticket_snapshot, ticket_b=offered.snapshot(),
        a_accepted=False, b_accepted=False, status=MS.PENDING,
        expires_at=min(target.expires_at, response.expires_at,
                       now + timedelta(minutes=settings.EXCHANGE_MATCH_TTL_MINUTES)),
    )
    db.add(response)
    db.flush()  # The existing partial unique index also guards concurrent offers.
    _record(db, response, None, user)
    db.add(match)
    _state(db, target, RS.MATCHED, actor=user)
    db.flush()
    _record(db, match, None, user)
    db.commit()
    return match


def mine(db, gateway, user):
    ids = owned_request_ids(db, user)
    refresh(db, gateway, ids)
    requests = db.scalars(select(ExchangeRequest).where(ExchangeRequest.requester_user_id == user.id)
                         .order_by(ExchangeRequest.created_at.desc(), ExchangeRequest.id)).all()
    matches = db.scalars(select(ExchangeMatch).where(or_(ExchangeMatch.request_a_id.in_(ids), ExchangeMatch.request_b_id.in_(ids)))
                        .order_by(ExchangeMatch.created_at.desc(), ExchangeMatch.id)).all()
    return {"requests": [request_view(r) for r in requests], "matches": matches}


def get_match(db, gateway, user, match_id):
    m, requests = _match(db, user, match_id)
    refresh(db, gateway, [r.id for r in requests])
    return _match(db, user, m.id)[0]


def act_on_match(db, gateway, user, match_id, action):
    m, requests = _match(db, user, match_id, lock=True)
    live = _refresh_locked(db, gateway, requests, m)
    if m.status == MS.READY and action == "cancel":
        _close_match(db, m, requests, live, utcnow(), MS.CANCELLED, "PARTICIPANT_CANCELLED", user)
        db.commit()
        return m
    if m.status != MS.PENDING:
        # Repeated acceptance is safe, but consent never triggers settlement.
        side_a = next(r for r in requests if r.id == m.request_a_id).requester_user_id == user.id
        if action == "accept" and m.status == MS.READY and (m.a_accepted if side_a else m.b_accepted):
            db.commit()
            return m
        db.commit()
        fail()
    side_a = next(r for r in requests if r.id == m.request_a_id).requester_user_id == user.id
    accepted = m.a_accepted if side_a else m.b_accepted
    if action == "accept":
        if not accepted:
            if side_a:
                m.a_accepted = True
            else:
                m.b_accepted = True
            audit.record(db, actor=user, action="EXCHANGE_ACCEPTED", entity_type="ExchangeMatch", entity_id=m.id,
                         after={"side": "A" if side_a else "B"})
        if m.a_accepted and m.b_accepted:
            _state(db, m, MS.READY, actor=user)
    else:
        if action == "reject" and accepted:
            fail("ALREADY_ACCEPTED", "cancel the pending match to withdraw acceptance")
        _close_match(db, m, requests, live, utcnow(), MS.REJECTED if action == "reject" else MS.CANCELLED,
                     "PARTICIPANT_REJECTED" if action == "reject" else "PARTICIPANT_CANCELLED", user)
    db.commit()
    return m


def cancel_request(db, gateway, user, request_id):
    _own(db, user, request_id)
    refresh(db, gateway, [request_id])
    r = _lock_requests(db, [request_id])[0]
    if r.requester_user_id != user.id or r.status != RS.OPEN or r.expires_at <= utcnow():
        fail()
    _state(db, r, RS.CANCELLED, "PARTICIPANT_CANCELLED", user)
    db.commit()
    return request_view(r)


def settle(db, gateway, settings, user, match_id, payment_method):
    """Simulated settlement with one atomic swap in B; never calls a real gateway."""
    if settings.PAYMENT_PROVIDER != "mock" or not callable(getattr(gateway, "swap", None)):
        fail("SETTLEMENT_UNAVAILABLE", "simulated settlement is unavailable with this ticketing/payment provider", 501)
    m, requests = _match(db, user, match_id, lock=True)
    if m.status == MS.COMPLETED:
        return m  # Idempotent replay cannot swap or charge twice.
    _refresh_locked(db, gateway, requests, m)
    if m.status != MS.READY:
        db.commit()
        fail("NOT_READY", "both participants must accept an active match before settlement")
    by_id = {r.id: r for r in requests}
    a, b = by_id[m.request_a_id], by_id[m.request_b_id]
    cents_a = int(Decimal(str(m.ticket_a["price"])) * 100)
    cents_b = int(Decimal(str(m.ticket_b["price"])) * 100)
    payer = a.requester_user_id if cents_b > cents_a else b.requester_user_id if cents_a > cents_b else None
    if payer and user.id != payer:
        fail("PAYER_REQUIRED", "the participant receiving the higher-priced ticket must settle the difference", 403)
    settlement = db.scalar(select(ExchangeSettlement).where(ExchangeSettlement.match_id == m.id))
    if settlement is None:
        settlement = ExchangeSettlement(match_id=m.id, payer_user_id=payer, amount_cents=abs(cents_b-cents_a),
                                        currency="SGD", status="PENDING")
        db.add(settlement)
    if payer and payment_method == "mock_fail":
        settlement.status = "FAILED"
        audit.record(db, actor=user, action="EXCHANGE_SETTLEMENT_FAILED", entity_type="ExchangeMatch", entity_id=m.id)
        db.commit()
        fail("EXCHANGE_PAYMENT_FAILED", "simulated payment declined; tickets are unchanged and you can retry", 402)
    gateway.swap(db, a.offered_ticket_id, b.offered_ticket_id, a.requester_user_id, b.requester_user_id)
    settlement.status = "SUCCEEDED"
    for r in requests:
        _state(db, r, RS.COMPLETED, actor=user)
    _state(db, m, MS.COMPLETED, actor=user)
    db.commit()
    return m
