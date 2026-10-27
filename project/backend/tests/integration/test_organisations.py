import pytest
from sqlalchemy import select

from app.core.security import utcnow
from app.db.models import MembershipStatus, Organisation, OrganisationMembership, Role, User
from app.services.mail.base import get_mailer
from tests.helpers import PASSWORD, add_membership, auth_header, error_of, login, make_user

MINE = "/api/v1/me/organisations"
ADMIN = "/api/v1/admin/organisation-requests"


def _organisation(db, name="LiveNation Singapore"):
    organisation = Organisation(name=name, listed=True)
    db.add(organisation)
    db.commit()
    return organisation


def _admin(client, db):
    return auth_header(client, make_user(db, Role.ADMIN).username)


def _signup(client, username="neworg", organisation="LiveNation Singapore", email="team@livenation.sg"):
    return client.post("/api/v1/auth/signup", json={
        "username": username, "password": PASSWORD, "email": f"{username}@gmail.com", "phone": "91234567",
        "role": "ORGANISER", "organisationName": organisation, "organisationEmail": email})


def _approve_account(client, db, username):
    user = db.scalar(select(User).where(User.username == username))
    user.email_verified_at = utcnow()
    db.commit()
    headers = _admin(client, db)
    [item] = [i for i in client.get("/api/v1/admin/organiser-requests", headers=headers).json()["items"]
              if i["username"] == username]
    assert client.post(f"/api/v1/admin/organiser-requests/{item['id']}/approve", headers=headers).status_code == 200
    return user


# ----------------------------------------------------------------- listing


def test_listed_organisations_are_public(client, db):
    _organisation(db, "LiveNation Singapore")
    db.add(Organisation(name="Hidden Org", listed=False))
    db.commit()
    names = [o["name"] for o in client.get("/api/v1/organisations").json()]
    assert names == ["LiveNation Singapore"]


# ----------------------------------------------------------------- sign-up


def test_sign_up_with_a_listed_organisation_is_approved_with_the_account(client, db):
    organisation = _organisation(db)
    assert _signup(client).status_code == 201
    user = _approve_account(client, db, "neworg")
    membership = db.scalar(select(OrganisationMembership).where(OrganisationMembership.user_id == user.id))
    db.refresh(membership)
    assert membership.status == MembershipStatus.APPROVED and membership.organisation_id == organisation.id
    headers = auth_header(client, "neworg")
    assert client.get("/api/v1/organiser/events", headers=headers).status_code == 200


def test_sign_up_with_others_creates_and_lists_the_organisation_on_approval(client, db):
    assert _signup(client, organisation="Indie Stage Collective", email="hello@indiestage.sg").status_code == 201
    assert [o["name"] for o in client.get("/api/v1/organisations").json()] == []
    _approve_account(client, db, "neworg")
    assert [o["name"] for o in client.get("/api/v1/organisations").json()] == ["Indie Stage Collective"]


def test_rejected_account_rejects_its_organisation_too(client, db):
    _organisation(db)
    _signup(client)
    headers = _admin(client, db)
    [item] = client.get("/api/v1/admin/organiser-requests", headers=headers).json()["items"]
    client.post(f"/api/v1/admin/organiser-requests/{item['id']}/reject", headers=headers, json={})
    membership = db.scalar(select(OrganisationMembership))
    db.refresh(membership)
    assert membership.status == MembershipStatus.REJECTED


# ----------------------------------------------------------------- organisers without an organisation


def test_organiser_without_an_organisation_is_blocked_but_can_request_one(client, db):
    organiser = make_user(db, Role.ORGANISER, organisation=False)
    headers = auth_header(client, organiser.username)
    blocked = client.get("/api/v1/organiser/events", headers=headers)
    assert blocked.status_code == 403 and error_of(blocked)["code"] == "ORGANISATION_REQUIRED"
    assert client.get(MINE, headers=headers).json() == []
    _organisation(db)
    response = client.post(MINE, headers=headers, json={"organisationName": "LiveNation Singapore",
                                                         "organisationEmail": "me@livenation.sg"})
    assert response.status_code == 201 and response.json()["status"] == "PENDING"
    assert client.get("/api/v1/organiser/events", headers=headers).status_code == 403


def test_pending_membership_does_not_unlock_organiser_features(client, db):
    organiser = make_user(db, Role.ORGANISER, organisation=False)
    add_membership(db, organiser, status=MembershipStatus.PENDING)
    response = client.get("/api/v1/organiser/events", headers=auth_header(client, organiser.username))
    assert error_of(response)["code"] == "ORGANISATION_REQUIRED"


# ----------------------------------------------------------------- adding an organisation


def test_adding_a_listed_organisation_after_admin_approval(client, db):
    _organisation(db, "AEG Presents Asia")
    organiser = make_user(db, Role.ORGANISER, email="org@gmail.com", email_verified_at=utcnow())
    headers = auth_header(client, organiser.username)
    request_id = client.post(MINE, headers=headers, json={"organisationName": "AEG PRESENTS ASIA",
                                                          "organisationEmail": "me@aeg.asia"}).json()["id"]
    assert get_mailer().outbox[-1].subject == "Your organisation request is submitted"
    approved = client.post(f"{ADMIN}/{request_id}/approve", headers=_admin(client, db))
    assert approved.status_code == 200 and approved.json()["status"] == "APPROVED"
    assert "AEG Presents Asia has been added" in get_mailer().outbox[-1].subject
    names = {m["organisationName"]: m["status"] for m in client.get(MINE, headers=headers).json()}
    assert names == {"Test Organisation": "APPROVED", "AEG Presents Asia": "APPROVED"}


def test_others_request_creates_a_listed_organisation(client, db):
    organiser = make_user(db, Role.ORGANISER)
    headers = auth_header(client, organiser.username)
    body = client.post(MINE, headers=headers, json={"organisationName": "Esplanade Presents",
                                                    "organisationEmail": "team@esplanade.com"}).json()
    assert body["organisationId"] is None and body["organisationName"] == "Esplanade Presents"
    [item] = client.get(ADMIN, headers=(admin := _admin(client, db))).json()["items"]
    assert item["newOrganisation"] is True
    client.post(f"{ADMIN}/{body['id']}/approve", headers=admin)
    assert "Esplanade Presents" in [o["name"] for o in client.get("/api/v1/organisations").json()]


def test_duplicate_requests_are_refused(client, db):
    _organisation(db)
    organiser = make_user(db, Role.ORGANISER)
    headers = auth_header(client, organiser.username)
    payload = {"organisationName": "LiveNation Singapore", "organisationEmail": "me@livenation.sg"}
    assert client.post(MINE, headers=headers, json=payload).status_code == 201
    assert error_of(client.post(MINE, headers=headers, json=payload))["code"] == "ORGANISATION_REQUEST_PENDING"
    already = client.post(MINE, headers=headers, json={"organisationName": "Test Organisation",
                                                       "organisationEmail": "me@test.org"})
    assert error_of(already)["code"] == "ALREADY_MEMBER"


def test_rejected_request_can_be_made_again(client, db):
    _organisation(db)
    organiser = make_user(db, Role.ORGANISER)
    headers = auth_header(client, organiser.username)
    payload = {"organisationName": "LiveNation Singapore", "organisationEmail": "me@livenation.sg"}
    request_id = client.post(MINE, headers=headers, json=payload).json()["id"]
    rejected = client.post(f"{ADMIN}/{request_id}/reject", headers=_admin(client, db), json={"reason": "Unknown"})
    assert rejected.json()["status"] == "REJECTED" and rejected.json()["reviewNote"] == "Unknown"
    assert client.post(MINE, headers=headers, json=payload).status_code == 201


@pytest.mark.parametrize("name,email,code", [("", "me@org.sg", "ORGANISATION_NAME_REQUIRED"),
                                             ("LiveNation Singapore", "nope", "ORGANISATION_EMAIL_INVALID")])
def test_organisation_details_are_required(client, db, name, email, code):
    headers = auth_header(client, make_user(db, Role.ORGANISER).username)
    response = client.post(MINE, headers=headers, json={"organisationName": name, "organisationEmail": email})
    assert error_of(response)["code"] == code


def test_admin_list_shows_only_add_requests_and_is_admin_only(client, db):
    _organisation(db)
    _signup(client)  # decided with the account request, so not listed here
    organiser = make_user(db, Role.ORGANISER)
    headers = auth_header(client, organiser.username)
    client.post(MINE, headers=headers, json={"organisationName": "LiveNation Singapore",
                                             "organisationEmail": "me@livenation.sg"})
    items = client.get(ADMIN, headers=_admin(client, db)).json()["items"]
    assert [i["username"] for i in items] == [organiser.username]
    assert client.get(ADMIN, headers=headers).status_code == 403


def test_customers_have_no_organisations(client, db):
    headers = auth_header(client, make_user(db).username)
    assert client.get(MINE, headers=headers).status_code == 403


def test_protected_organiser_can_belong_to_an_organisation(client, db):
    jay = make_user(db, Role.ORGANISER, username="Jay", organisation=False)
    add_membership(db, jay, name="LiveNation Singapore")
    body = login(client, "Jay")
    assert client.get("/api/v1/organiser/events", headers={"Authorization": f"Bearer {body['accessToken']}"}).status_code == 200
    [membership] = client.get(MINE, headers={"Authorization": f"Bearer {body['accessToken']}"}).json()
    assert membership["organisationName"] == "LiveNation Singapore" and membership["status"] == "APPROVED"
