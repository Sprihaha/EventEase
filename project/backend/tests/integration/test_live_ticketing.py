"""B and D use the same authoritative tickets, seats and ownership records."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.db.models import Booking, BookingStatus, EventStatus, EventSeat, ExchangeSettlement, Role, SeatClaim, Ticket, TicketCategory, User
from app.db.session import SessionLocal
from app.schemas.bookings import BookingCreate
from app.services import bookings
from app.services.payments.base import MockPaymentProvider, set_payment_provider
from tests.helpers import auth_header, make_event, make_user

X = "/api/v1/exchanges"


@pytest.fixture
def world(client, db):
    set_payment_provider(MockPaymentProvider())
    staff, a, b = make_user(db, Role.ORGANISER), make_user(db), make_user(db)
    event = make_event(db, organiser=staff, days=30, categories=[("STANDARD", 7549, 10), ("VIP", 15000, 10)])
    cats = list(db.scalars(select(TicketCategory).where(TicketCategory.event_id == event.id).order_by(TicketCategory.price_cents)))
    seats = []
    for row, cat, section in (("B", cats[0], "West"), ("A", cats[1], "Front")):
        cat.seat_section = section
        for n in range(1,5):
            seat = EventSeat(event_id=event.id, ticket_category_id=cat.id, label=f"{row}{n}", row_label=row, number=n)
            db.add(seat); seats.append(seat)
    db.commit()
    yield SimpleNamespace(staff=staff,a=a,b=b,event=event,seats=seats,
        ha=auth_header(client,a.username),hb=auth_header(client,b.username),hs=auth_header(client,staff.username))
    set_payment_provider(None)


def hold(client, w, headers, seats, **kwargs):
    counts = {}
    for s in seats: counts[str(s.ticket_category_id)] = counts.get(str(s.ticket_category_id),0)+1
    return client.post("/api/v1/bookings",headers=headers,json={"eventId":str(w.event.id),"seatIds":[str(s.id) for s in seats],
        "items":[{"ticketCategoryId":k,"quantity":v} for k,v in counts.items()]}, **kwargs)


def paid(client, w, headers, seats):
    held=hold(client,w,headers,seats); assert held.status_code==201,held.text
    result=client.post(f"/api/v1/bookings/{held.json()['id']}/pay",headers=headers,json={})
    assert result.status_code==200,result.text
    return result.json()


def ready(client,w,ta,tb):
    requests=[]
    for headers,t in ((w.ha,ta),(w.hb,tb)):
        r=client.post(X,headers=headers,json={"offeredTicketId":t["id"],"desiredCategoryType":None,
            "desiredSeatSection":None,"allowCrossTier":True,"requestType":"PUBLIC"})
        assert r.status_code==201,r.text
        requests.append(r.json())
    m=client.post(f"{X}/{requests[0]['id']}/interest",headers=w.ha,json={"targetRequestId":requests[1]["id"]})
    assert m.status_code==200,m.text
    m=m.json()
    for h in (w.ha,w.hb):
        response=client.post(f"{X}/matches/{m['id']}/accept",headers=h)
        assert response.status_code==200,response.text
    return response.json()


def test_live_seats_hold_decline_retry_issue_refund(client,db,world):
    w=world
    path=f"/api/v1/events/{w.event.id}/seats"
    assert all(s["status"]=="AVAILABLE" for s in client.get(path).json())
    r=hold(client,w,w.ha,[w.seats[0]]); assert r.status_code==201,r.text
    b=r.json(); assert b["tickets"]==[] and b["totalCents"]==7549
    assert next(s for s in client.get(path).json() if s["id"]==str(w.seats[0].id))["status"]=="HELD"
    assert hold(client,w,w.hb,[w.seats[0]]).status_code==409
    assert client.post(f"/api/v1/bookings/{b['id']}/pay",headers=w.ha,json={"paymentMethod":"mock_fail"}).status_code==402
    p=client.post(f"/api/v1/bookings/{b['id']}/pay",headers=w.ha,json={}).json()
    assert p["tickets"][0]["seatLabel"]=="B1"
    t=p["tickets"][0]
    assert client.get(f"/api/v1/tickets/{t['code']}/verify").json()["valid"]
    assert client.post(f"/api/v1/me/bookings/{b['id']}/cancel",headers=w.ha).status_code==200
    assert client.get(f"/api/v1/tickets/{t['code']}/verify").json()["valid"] is False
    assert next(s for s in client.get(path).json() if s["id"]==str(w.seats[0].id))["status"]=="AVAILABLE"


def test_seat_selection_constraints_and_hold_expiry(client,db,world):
    w=world
    body={"eventId":str(w.event.id),"items":[{"ticketCategoryId":str(w.seats[0].ticket_category_id),"quantity":1}]}
    assert client.post("/api/v1/bookings",headers=w.ha,json=body).status_code==422
    assert client.post("/api/v1/bookings",headers=w.ha,json={**body,"seatIds":[str(w.seats[4].id)]}).status_code==422
    r=hold(client,w,w.ha,[w.seats[0]]).json()
    booking=db.get(Booking,uuid.UUID(r["id"])); booking.hold_expires_at=utcnow()-timedelta(seconds=1); db.commit()
    assert client.post(f"/api/v1/bookings/{r['id']}/pay",headers=w.ha,json={}).status_code==409
    db.expire_all(); assert db.get(SeatClaim,w.seats[0].id) is None
    assert hold(client,w,w.hb,[w.seats[0]]).status_code==201


def test_atomic_individual_swap_preserves_sibling_ticket_and_reissues_qr(client,db,world):
    w=world
    a=paid(client,w,w.ha,w.seats[:2]); b=paid(client,w,w.hb,[w.seats[2]])
    ta,tb=a["tickets"][0],b["tickets"][0]
    m=ready(client,w,ta,tb)
    path=f"{X}/matches/{m['id']}/settle"
    response=client.post(path,headers=w.ha,json={}); assert response.status_code==200,response.text
    assert response.json()["status"]=="COMPLETED"
    db.expire_all()
    ticket_a,ticket_b=db.get(Ticket,uuid.UUID(ta["id"])),db.get(Ticket,uuid.UUID(tb["id"]))
    assert ticket_a.owner_user_id==w.b.id and ticket_b.owner_user_id==w.a.id
    sibling=db.get(Ticket,uuid.UUID(a["tickets"][1]["id"]))
    assert sibling.owner_user_id==w.a.id and sibling.code==a["tickets"][1]["code"]
    assert db.get(Booking,uuid.UUID(a["id"])).user_id==w.a.id
    assert db.get(Booking,uuid.UUID(b["id"])).user_id==w.b.id
    for old in (ta["code"],tb["code"]):
        assert client.get(f"/api/v1/tickets/{old}/verify").status_code==404
    codes=(ticket_a.code,ticket_b.code)
    assert client.post(path,headers=w.hb,json={}).json()["status"]=="COMPLETED"
    db.expire_all(); assert (ticket_a.code,ticket_b.code)==codes
    history=client.get("/api/v1/me/tickets/history",headers=w.ha).json()
    assert {t["id"] for t in history}=={tb["id"],sibling.id.__str__()}
    purchase=client.get(f"/api/v1/me/bookings/{a['id']}",headers=w.ha).json()
    assert ta["id"] not in {t["id"] for t in purchase["tickets"]}
    assert purchase["cancellable"] is False
    assert client.post(f"/api/v1/me/bookings/{a['id']}/cancel",headers=w.ha).status_code==409


def test_price_delta_decline_retry_and_payer_authorization(client,db,world):
    w=world
    a,b=paid(client,w,w.ha,[w.seats[0]]),paid(client,w,w.hb,[w.seats[4]])
    ta,tb=a["tickets"][0],b["tickets"][0]; m=ready(client,w,ta,tb)
    path=f"{X}/matches/{m['id']}/settle"
    assert client.post(path,headers=w.hb,json={}).status_code==403
    assert client.post(path,headers=w.ha,json={"paymentMethod":"mock_fail"}).status_code==402
    assert client.get(f"/api/v1/tickets/{ta['code']}/verify").json()["valid"]
    assert client.post(path,headers=w.ha,json={}).json()["status"]=="COMPLETED"
    settlement=db.scalar(select(ExchangeSettlement).where(ExchangeSettlement.match_id==uuid.UUID(m["id"])))
    assert settlement.amount_cents==7451 and settlement.status=="SUCCEEDED" and settlement.payer_user_id==w.a.id


def test_checkin_is_authorized_persistent_and_blocks_refund_exchange(client,world):
    w=world
    b=paid(client,w,w.ha,[w.seats[0]]); t=b["tickets"][0]; path=f"/api/v1/tickets/{t['code']}"
    assert client.post(path+"/checkin",json={}).status_code==401
    assert client.post(path+"/checkin",headers=w.ha,json={}).status_code==403
    assert client.post(path+"/checkin",headers=w.hs,json={}).json()["result"]=="ADMITTED"
    assert client.post(path+"/checkin",headers=w.hs,json={}).json()["result"]=="DUPLICATE_SCAN"
    assert client.get(path+"/verify").json()["checkedInAt"]
    assert client.post(f"/api/v1/me/bookings/{b['id']}/cancel",headers=w.ha).status_code==409
    assert client.get(X+"/eligible-tickets",headers=w.ha).json()[0]["eligible"] is False


def test_concurrent_seat_claim_has_one_winner(client,db,world):
    w=world; barrier=Barrier(2); event_id=w.event.id; seat_id=w.seats[0].id; category=w.seats[0].ticket_category_id
    def run(user_id):
        with SessionLocal() as session:
            user=session.get(User,user_id); barrier.wait(timeout=10)
            try:
                bookings.create_booking(session,get_settings(),user,BookingCreate(eventId=event_id,seatIds=[seat_id],
                    items=[{"ticketCategoryId":category,"quantity":1}]),"127.0.0.1")
                return 201
            except AppError as error: session.rollback(); return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(run,[w.a.id,w.b.id]))==[201,409]


def test_returned_exchanged_ticket_still_blocks_original_booking_refund(client, db, world):
    w = world
    a = paid(client, w, w.ha, [w.seats[0]])
    b = paid(client, w, w.hb, [w.seats[1]])
    ta, tb = a['tickets'][0], b['tickets'][0]
    first = ready(client, w, ta, tb)
    assert client.post(f"{X}/matches/{first['id']}/settle", headers=w.ha, json={}).status_code == 200
    # Offer the received tickets back. The existing ticket IDs survive both swaps.
    second = ready(client, w, tb, ta)
    assert client.post(f"{X}/matches/{second['id']}/settle", headers=w.ha, json={}).status_code == 200
    db.expire_all()
    t = db.get(Ticket, uuid.UUID(ta['id']))
    assert t.owner_user_id == w.a.id and t.exchanged_at is not None
    assert client.get(f"/api/v1/me/bookings/{a['id']}", headers=w.ha).json()['cancellable'] is False
    assert client.post(f"/api/v1/me/bookings/{a['id']}/cancel", headers=w.ha).status_code == 409


def test_payment_rechecks_event_approval_and_releases_claim(client, db, world):
    w = world
    held = hold(client, w, w.ha, [w.seats[0]]).json()
    w.event.status = EventStatus.SUSPENDED
    db.commit()
    response = client.post(f"/api/v1/bookings/{held['id']}/pay", headers=w.ha, json={})
    assert response.status_code == 409
    db.expire_all()
    assert db.get(Booking, uuid.UUID(held['id'])).status == BookingStatus.CANCELLED
    assert db.get(SeatClaim, w.seats[0].id) is None
    assert client.get('/api/v1/me/tickets/history', headers=w.ha).json() == []


def test_late_successful_webhook_refunds_without_issuing_tickets(client, db, world):
    w = world
    held = hold(client, w, w.ha, [w.seats[0]]).json()
    booking = db.get(Booking, uuid.UUID(held['id']))
    booking.hold_expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    bookings.handle_payment_webhook(db, held['payment']['providerRef'], True)
    db.expire_all()
    assert db.get(Booking, booking.id).status == BookingStatus.CANCELLED
    assert db.get(SeatClaim, w.seats[0].id) is None
    assert client.get('/api/v1/me/tickets/history', headers=w.ha).json() == []
    from app.db.models import Payment, PaymentKind, PaymentStatus
    refunds = list(db.scalars(select(Payment).where(Payment.kind == PaymentKind.REFUND)))
    assert len(refunds) == 1 and refunds[0].status == PaymentStatus.SUCCEEDED
