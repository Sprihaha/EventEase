from datetime import timedelta

from app.core.security import utcnow
from tests.helpers import auth_header, make_user
from app.db.models import Role


def test_organiser_submission_admin_approval_customer_booking(client,db):
    organiser,admin,customer=make_user(db,Role.ORGANISER),make_user(db,Role.ADMIN),make_user(db)
    ho,ha,hc=(auth_header(client,u.username) for u in (organiser,admin,customer))
    start=utcnow()+timedelta(days=30)
    response=client.post("/api/v1/organiser/events",headers=ho,json={
        "title":"Created through organiser API","category":"CONCERT","venueName":"Test Hall","area":"Singapore",
        "startAt":start.isoformat(),"endAt":(start+timedelta(hours=3)).isoformat(),"capacity":10,
        "initialCategories":[{"type":"STANDARD","name":"Standard","priceCents":6549,"quantity":10}]})
    assert response.status_code==201,response.text
    event=response.json(); assert event["status"]=="REVIEW_IN_PROGRESS"
    assert event["id"] not in {e["id"] for e in client.get("/api/v1/events").json()["items"]}
    assert client.get(f"/api/v1/events/{event['id']}/seats").status_code==404
    assert client.post(f"/api/v1/admin/events/{event['id']}/approve",headers=ha).status_code==200
    assert event["id"] in {e["id"] for e in client.get("/api/v1/events").json()["items"]}
    seats=client.get(f"/api/v1/events/{event['id']}/seats").json(); assert len(seats)==10
    response=client.post("/api/v1/bookings",headers=hc,json={"eventId":event["id"],"seatIds":[seats[0]["id"]],
        "items":[{"ticketCategoryId":seats[0]["ticketCategoryId"],"quantity":1}]})
    assert response.status_code==201,response.text
    assert response.json()["totalCents"]==6549
    response=client.post(f"/api/v1/bookings/{response.json()['id']}/pay",headers=hc,json={})
    assert response.status_code==200 and response.json()["tickets"][0]["seatLabel"]==seats[0]["label"]
