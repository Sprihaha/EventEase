"""Phase 2 workflows, using only the disposable test database."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
import uuid

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import AuditLog, Ticket, TicketStatus, User
from app.db.models.exchange import ExchangeMatch, ExchangeRequest, ExchangeSettlement, ExchangeMatchStatus as MS
from app.db.session import SessionLocal
from app.services import exchanges
from app.services.exchange_ticketing import RelationalTicketingGateway
from tests.integration.test_exchanges import ROOT, world, ticket, offer, pair, match, action, ticket_interest


def eligibility(client, w, offered, username=None, headers=None):
    return client.get(ROOT + '/recipients/eligibility', headers=headers or w.ha,
                      params={'offeredTicketId': offered['id'], 'username': username or w.b.username})


def unchanged(db, bookings, owners):
    db.expire_all()
    for booking, owner in zip(bookings, owners):
        item = booking['tickets'][0]
        t = db.get(Ticket, uuid.UUID(item['id']))
        assert t.owner_user_id == owner.id and t.code == item['code'] and t.exchanged_at is None


def test_public_zero_one_multiple_candidates_and_implicit_irreversible_acceptance(client, db, world):
    w = world
    a = ticket(client, w.ha, w)
    target = offer(client, w.ha, a['tickets'][0]['id']).json()
    path = f"{ROOT}/{target['id']}/eligible-tickets"
    assert client.get(path, headers=w.hb).json() == []
    first = ticket(client, w.hb, w)
    assert len(client.get(path, headers=w.hb).json()) == 1
    second = ticket(client, w.hb, w)
    result = client.get(path, headers=w.hb)
    assert len(result.json()) == 2
    assert first['tickets'][0]['code'] not in result.text
    offered_id = second['tickets'][0]['id']
    proposal = ticket_interest(client, w.hb, target['id'], offered_id).json()
    assert proposal['bAccepted'] and not proposal['aAccepted']
    for verb in ('reject', 'cancel'):
        assert action(client, w.hb, proposal, verb).status_code == 409
    assert ticket_interest(client, w.hb, target['id'], offered_id).status_code == 409
    assert db.scalar(select(func.count()).select_from(ExchangeMatch)) == 1
    events = client.get(ROOT + '/activity', headers=w.ha).json()
    assert any(e['matchId'] == proposal['id'] and e['action'] == 'EXCHANGE_PENDING' and not e['ownAction'] for e in events)
    assert action(client, w.ha, proposal, 'reject').json()['status'] == 'REJECTED'
    assert db.get(Ticket, uuid.UUID(offered_id)).owner_user_id == w.b.id


def test_direct_eligibility_is_boolean_private_and_rechecked_at_send(client, db, world):
    w = world
    a = ticket(client, w.ha, w)['tickets'][0]
    assert eligibility(client, w, a).json() == {'eligible': False}
    response = offer(client, w.ha, a['id'], requestType='DIRECT', recipientUsername=w.b.username)
    assert response.status_code == 422 and response.json()['error']['code'] == 'RECIPIENT_INELIGIBLE'
    b = ticket(client, w.hb, w)['tickets'][0]
    assert eligibility(client, w, a).json() == {'eligible': True}
    assert b['id'] not in eligibility(client, w, a).text and b['code'] not in eligibility(client, w, a).text
    row = db.get(Ticket, uuid.UUID(b['id'])); row.checked_in_at = utcnow(); db.commit()
    assert eligibility(client, w, a).json() == {'eligible': False}
    response = offer(client, w.ha, a['id'], requestType='DIRECT', recipientUsername=w.b.username)
    assert response.status_code == 422
    assert db.scalar(select(func.count()).select_from(ExchangeRequest)) == 0
    assert eligibility(client, w, a, headers=w.hx).status_code == 404
    assert client.get(ROOT + '/recipients/eligibility', params={'offeredTicketId': a['id'], 'username': w.b.username}).status_code == 401


def test_direct_invitation_can_be_rejected_or_accepted_with_ticket_revalidation(client, db, world):
    w = world
    a, b = ticket(client, w.ha, w), ticket(client, w.hb, w)
    direct = offer(client, w.ha, a['tickets'][0]['id'], requestType='DIRECT', recipientUsername=w.b.username).json()
    reject = f"{ROOT}/{direct['id']}/reject-invitation"
    assert client.post(reject, headers=w.hx).status_code == 404
    assert client.post(reject, headers=w.hb).json()['status'] == 'CANCELLED'
    assert any(e['action'] == 'EXCHANGE_REJECTED' for e in client.get(ROOT + '/activity', headers=w.ha).json())
    direct = offer(client, w.ha, a['tickets'][0]['id'], requestType='DIRECT', recipientUsername=w.b.username).json()
    db.get(Ticket, uuid.UUID(b['tickets'][0]['id'])).status = TicketStatus.CANCELLED; db.commit()
    assert client.get(f"{ROOT}/{direct['id']}/eligible-tickets", headers=w.hb).json() == []
    result = ticket_interest(client, w.hb, direct['id'], b['tickets'][0]['id'])
    assert result.status_code == 409 and result.json()['error']['code'] == 'TICKET_INELIGIBLE'
    assert db.scalar(select(func.count()).select_from(ExchangeMatch)) == 0


def test_equal_auto_completion_rotates_codes_updates_ownership_and_prevents_second_exchange(client, db, world):
    w = world
    a, b = ticket(client, w.ha, w), ticket(client, w.hb, w)
    target = offer(client, w.ha, a['tickets'][0]['id']).json()
    proposal = ticket_interest(client, w.hb, target['id'], b['tickets'][0]['id']).json()
    unchanged(db, (a, b), (w.a, w.b))
    result = action(client, w.ha, proposal, 'accept')
    assert result.status_code == 200 and result.json()['status'] == 'COMPLETED'
    assert result.json()['amountCents'] == 0 and result.json()['paymentStatus'] == 'SUCCEEDED'
    codes = []
    for booking, new_owner in ((a, w.b), (b, w.a)):
        old = booking['tickets'][0]
        row = db.get(Ticket, uuid.UUID(old['id'])); db.refresh(row)
        assert row.owner_user_id == new_owner.id and row.exchanged_at
        assert row.code != old['code']; codes.append(row.code)
        assert client.get(f"/api/v1/tickets/{old['code']}/verify").status_code != 200
        headers = w.hb if new_owner == w.b else w.ha
        assert offer(client, headers, str(row.id)).status_code == 409
        owned = client.get('/api/v1/me/tickets/history', headers=headers).json()
        assert [t['id'] for t in owned] == [str(row.id)]
    for _ in range(2):
        assert action(client, w.ha, proposal, 'accept').json()['status'] == 'COMPLETED'
        assert client.post(f"{ROOT}/matches/{proposal['id']}/settle", headers=w.ha, json={}).json()['status'] == 'COMPLETED'
    db.expire_all()
    assert [db.get(Ticket, uuid.UUID(x['tickets'][0]['id'])).code for x in (a, b)] == codes
    assert db.scalar(select(func.count()).select_from(ExchangeSettlement)) == 1
    assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == 'ExchangeMatch', AuditLog.action == 'EXCHANGE_COMPLETED')) == 1
    for h in (w.ha, w.hb):
        assert any(e['action'] == 'EXCHANGE_COMPLETED' for e in client.get(ROOT + '/activity', headers=h).json())


@pytest.mark.parametrize('outcome,status,http', [('mock_fail', 'FAILED', 402), ('mock_pending', 'PENDING', 200), ('mock_cancel', 'CANCELLED', 200)])
def test_difference_payment_unresolved_outcomes_preserve_tickets_and_allow_retry(client, db, world, outcome, status, http):
    w = world
    a, b, ba, bb = pair(client, w, unequal=True)
    m = match(client, w, a, b)
    ready = action(client, w.hb, m, 'accept').json()
    assert ready['status'] == 'READY' and ready['paymentStatus'] == 'PENDING'
    expected = w.vip.price_cents - w.category.price_cents
    payer = client.get(f"{ROOT}/matches/{m['id']}", headers=w.ha).json()
    receiver = client.get(f"{ROOT}/matches/{m['id']}", headers=w.hb).json()
    assert payer['isPayer'] and not receiver['isPayer'] and payer['amountCents'] == expected
    path = f"{ROOT}/matches/{m['id']}/settle"
    assert client.post(path, headers=w.hb, json={}).status_code == 403
    assert client.post(path, headers=w.ha, json={'paymentMethod': outcome}).status_code == http
    pending = client.get(f"{ROOT}/matches/{m['id']}", headers=w.ha).json()
    assert pending['status'] == 'READY' and pending['paymentStatus'] == status
    unchanged(db, (ba, bb), (w.a, w.b))
    complete = client.post(path, headers=w.ha, json={'paymentMethod': 'mock_success'})
    assert complete.json()['status'] == 'COMPLETED'
    assert complete.json()['paymentStatus'] == 'SUCCEEDED'
    assert client.post(path, headers=w.ha, json={'paymentMethod': outcome}).json()['paymentStatus'] == 'SUCCEEDED'
    assert db.scalar(select(func.count()).select_from(ExchangeSettlement)) == 1


@pytest.mark.parametrize('phase', ['create', 'accept', 'payment'])
def test_seven_day_cutoff_blocks_every_mutation_even_with_legacy_expiry(client, db, world, monkeypatch, phase):
    w = world
    if phase == 'create':
        ba = ticket(client, w.ha, w)
        w.event.start_at = utcnow() + timedelta(days=7); db.commit()
        assert offer(client, w.ha, ba['tickets'][0]['id']).status_code == 409
        return
    a, b, ba, bb = pair(client, w, unequal=True)
    m = match(client, w, a, b)
    if phase == 'payment':
        assert action(client, w.hb, m, 'accept').json()['status'] == 'READY'
    # Give synthetic legacy records long deadlines to isolate the cutoff from TTL expiry.
    for request_id in (m['requestAId'], m['requestBId']):
        db.get(ExchangeRequest, uuid.UUID(request_id)).expires_at = w.event.start_at + timedelta(days=1)
    db.get(ExchangeMatch, uuid.UUID(m['id'])).expires_at = w.event.start_at + timedelta(days=1)
    db.commit()
    cutoff = w.event.start_at - timedelta(days=7)
    monkeypatch.setattr(exchanges, 'utcnow', lambda: cutoff)
    path = f"{ROOT}/matches/{m['id']}/settle"
    result = action(client, w.hb, m, 'accept') if phase == 'accept' else client.post(path, headers=w.ha, json={})
    assert result.status_code == 409
    unchanged(db, (ba, bb), (w.a, w.b))


def test_legacy_ready_record_is_not_silently_completed_by_get(client, db, world):
    w = world
    a, b, ba, bb = pair(client, w)
    m = match(client, w, a, b)
    row = db.get(ExchangeMatch, uuid.UUID(m['id'])); row.b_accepted = True; row.status = MS.READY; db.commit()
    assert client.get(f"{ROOT}/matches/{m['id']}", headers=w.ha).json()['status'] == 'READY'
    unchanged(db, (ba, bb), (w.a, w.b))


def test_simultaneous_payer_requests_settle_once(client, db, world):
    w = world
    a, b, ba, bb = pair(client, w, unequal=True)
    m = match(client, w, a, b); action(client, w.hb, m, 'accept')
    barrier = Barrier(2); payer_id = w.a.id
    def pay(_):
        with SessionLocal() as session:
            payer = session.get(User, payer_id); barrier.wait(timeout=10)
            return exchanges.settle(session, RelationalTicketingGateway(), get_settings(), payer, uuid.UUID(m['id']), 'mock_success').status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(pay, range(2))) == [MS.COMPLETED, MS.COMPLETED]
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(ExchangeSettlement)) == 1
    assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == 'ExchangeMatch', AuditLog.action == 'EXCHANGE_COMPLETED')) == 1


def test_concurrent_public_interest_same_ticket_and_request_creates_one_acceptance(client, db, world):
    w = world
    a, b = ticket(client, w.ha, w), ticket(client, w.hb, w)
    target = offer(client, w.ha, a['tickets'][0]['id']).json()
    target_id, offered_id, user_id = uuid.UUID(target['id']), b['tickets'][0]['id'], w.b.id
    barrier = Barrier(2)
    def propose(_):
        with SessionLocal() as session:
            user = session.get(User, user_id); barrier.wait(timeout=10)
            try:
                exchanges.ticket_interest(session, RelationalTicketingGateway(), get_settings(), user, target_id, offered_id)
                return 200
            except AppError as error:
                session.rollback(); return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(propose, range(2))) == [200, 409]
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(ExchangeMatch)) == 1
    assert db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == 'EXCHANGE_ACCEPTED')) == 1


def test_direct_recipient_reserved_or_previously_exchanged_ticket_is_ineligible(client, db, world):
    w = world
    a, b = ticket(client, w.ha, w)['tickets'][0], ticket(client, w.hb, w)['tickets'][0]
    reserved = offer(client, w.hb, b['id']).json()
    assert eligibility(client, w, a).json() == {'eligible': False}
    assert client.post(f"{ROOT}/{reserved['id']}/cancel", headers=w.hb).status_code == 200
    db.get(Ticket, uuid.UUID(b['id'])).exchanged_at = utcnow(); db.commit()
    assert eligibility(client, w, a).json() == {'eligible': False}
    assert offer(client, w.ha, a['id'], requestType='DIRECT', recipientUsername=w.b.username).status_code == 422


def test_difference_payment_transfer_failure_rolls_back_and_retry_is_safe(client, db, world, monkeypatch):
    w = world
    a, b, ba, bb = pair(client, w, unequal=True)
    m = match(client, w, a, b); action(client, w.hb, m, 'accept')
    original = RelationalTicketingGateway.swap
    def interrupted(self, session, *args):
        original(self, session, *args); session.flush()
        raise RuntimeError('injected paid swap failure')
    monkeypatch.setattr(RelationalTicketingGateway, 'swap', interrupted)
    path = f"{ROOT}/matches/{m['id']}/settle"
    with pytest.raises(RuntimeError, match='injected paid swap failure'):
        client.post(path, headers=w.ha, json={})
    unchanged(db, (ba, bb), (w.a, w.b))
    pending = client.get(f"{ROOT}/matches/{m['id']}", headers=w.ha).json()
    assert pending['status'] == 'READY' and pending['paymentStatus'] == 'PENDING'
    monkeypatch.setattr(RelationalTicketingGateway, 'swap', original)
    assert client.post(path, headers=w.ha, json={}).json()['status'] == 'COMPLETED'
    assert db.scalar(select(func.count()).select_from(ExchangeSettlement)) == 1


def test_initiation_rechecks_clock_after_waiting_for_ticket_locks(client, db, world, monkeypatch):
    w = world
    booking = ticket(client, w.ha, w)
    cutoff = w.event.start_at - timedelta(days=7)
    clock = [cutoff - timedelta(seconds=1)]
    original = RelationalTicketingGateway.load
    def waited(self, session, ids, now, *, lock=False):
        result = original(self, session, ids, now, lock=lock)
        if lock:
            clock[0] = cutoff + timedelta(seconds=1)
        return result
    monkeypatch.setattr(exchanges, 'utcnow', lambda: clock[0])
    monkeypatch.setattr(RelationalTicketingGateway, 'load', waited)
    assert offer(client, w.ha, booking['tickets'][0]['id']).status_code == 409
    assert db.scalar(select(func.count()).select_from(ExchangeRequest)) == 0
