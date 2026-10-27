import pytest
from sqlalchemy import func, select

from app.core.security import generate_password, utcnow
from app.db.models import AuditLog, OrganiserApplication, OrganiserApplicationStatus, Role, User
from app.services.mail.base import get_mailer
from tests.helpers import PASSWORD, auth_header, error_of, forgot_password, login, make_user

REQUESTS = "/api/v1/admin/organiser-requests"


def _signup_organiser(client, username="neworg", email="neworg@gmail.com", organisation="Fan Events",
                      organisation_email="team@fanevents.sg"):
    return client.post("/api/v1/auth/signup", json={
        "username": username, "password": PASSWORD, "email": email, "phone": "91234567", "role": "ORGANISER",
        "organisationName": organisation, "organisationEmail": organisation_email})


def _verify(db, username):
    user = db.scalar(select(User).where(User.username == username))
    user.email_verified_at = utcnow()
    db.commit()
    return user


def _login(client, identifier, password=PASSWORD, portal=None):
    body = {"identifier": identifier, "password": password}
    if portal:
        body["portal"] = portal
    return client.post("/api/v1/auth/login", json=body)


def _admin(client, db):
    admin = make_user(db, Role.ADMIN)
    return auth_header(client, admin.username)


def _request_id(client, headers, username):
    items = client.get(REQUESTS, headers=headers, params={"status": "PENDING"}).json()["items"]
    return next(item["id"] for item in items if item["username"] == username)


# ----------------------------------------------------------------- sign-up


def test_organiser_sign_up_submits_a_request(client, db):
    response = _signup_organiser(client)
    assert response.status_code == 201
    body = response.json()
    assert body["approvalRequired"] is True and body["message"].startswith("Your request has been submitted")
    application = db.scalar(select(OrganiserApplication))
    assert application.status == OrganiserApplicationStatus.PENDING
    assert (application.organisation_name, application.organisation_email) == ("Fan Events", "team@fanevents.sg")
    assert "administrator will review it" in get_mailer().outbox[-1].body


@pytest.mark.parametrize("organisation,organisation_email,code", [
    ("", "team@fanevents.sg", "ORGANISATION_NAME_REQUIRED"),
    ("   ", "team@fanevents.sg", "ORGANISATION_NAME_REQUIRED"),
    ("Fan Events", "", "ORGANISATION_EMAIL_INVALID"),
    ("Fan Events", "not-an-email", "ORGANISATION_EMAIL_INVALID"),
])
def test_both_organisation_details_are_required(client, db, organisation, organisation_email, code):
    response = _signup_organiser(client, organisation=organisation, organisation_email=organisation_email)
    assert response.status_code == 400 and error_of(response)["code"] == code
    assert db.scalar(select(func.count()).select_from(User)) == 0


def test_customers_do_not_need_organisation_details(client, db):
    response = client.post("/api/v1/auth/signup", json={"username": "newfan", "password": PASSWORD,
                                                         "email": "newfan@gmail.com", "phone": "91234567",
                                                         "role": "CUSTOMER"})
    assert response.status_code == 201 and response.json()["approvalRequired"] is False
    assert db.scalar(select(func.count()).select_from(OrganiserApplication)) == 0


def test_several_people_can_apply_under_one_organisation(client, db):
    assert _signup_organiser(client, "orgone", "one@gmail.com").status_code == 201
    assert _signup_organiser(client, "orgtwo", "two@gmail.com", organisation="fan  EVENTS").status_code == 201
    headers = _admin(client, db)
    items = client.get(REQUESTS, headers=headers).json()["items"]
    assert len(items) == 2 and all(item["sameOrganisationRequests"] == 1 for item in items)


# ----------------------------------------------------------------- login before / after review


def test_pending_organiser_cannot_log_in(client, db):
    _signup_organiser(client)
    assert error_of(_login(client, "neworg", portal="ORGANISER"))["code"] == "EMAIL_NOT_VERIFIED"
    _verify(db, "neworg")
    response = _login(client, "neworg", portal="ORGANISER")
    assert response.status_code == 403 and error_of(response)["code"] == "ORGANISER_PENDING"


def test_pending_organiser_cannot_get_in_through_password_reset(client, db):
    _signup_organiser(client)
    user = _verify(db, "neworg")
    response = forgot_password(client, user.username, user.email)
    assert error_of(response)["code"] == "ORGANISER_PENDING"
    assert all("token=" not in m.body for m in get_mailer().outbox)


def test_admin_approves_then_organiser_logs_in(client, db):
    _signup_organiser(client)
    _verify(db, "neworg")
    headers = _admin(client, db)
    approved = client.post(f"{REQUESTS}/{_request_id(client, headers, 'neworg')}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED" and approved.json()["reviewedBy"]
    notice = get_mailer().outbox[-1]
    assert notice.to == "neworg@gmail.com" and notice.subject == "Your EventEase organiser account is approved"
    body = login(client, "neworg")
    assert body["user"]["role"] == "ORGANISER"
    assert db.scalar(select(AuditLog.action).where(AuditLog.action == "ORGANISER_APPROVED"))


def test_admin_rejects_with_a_reason(client, db):
    _signup_organiser(client)
    _verify(db, "neworg")
    headers = _admin(client, db)
    rejected = client.post(f"{REQUESTS}/{_request_id(client, headers, 'neworg')}/reject", headers=headers,
                           json={"reason": "Could not confirm the organisation"})
    assert rejected.status_code == 200 and rejected.json()["status"] == "REJECTED"
    assert "Could not confirm the organisation" in get_mailer().outbox[-1].body
    response = _login(client, "neworg")
    assert error_of(response)["code"] == "ORGANISER_REJECTED"
    assert error_of(response)["details"]["reason"] == "Could not confirm the organisation"


def test_a_request_can_only_be_decided_once(client, db):
    _signup_organiser(client)
    headers = _admin(client, db)
    request_id = _request_id(client, headers, "neworg")
    assert client.post(f"{REQUESTS}/{request_id}/approve", headers=headers).status_code == 200
    again = client.post(f"{REQUESTS}/{request_id}/reject", headers=headers, json={})
    assert again.status_code == 409 and error_of(again)["code"] == "INVALID_STATUS_TRANSITION"


def test_no_decision_email_for_an_unverified_address(client, db):
    _signup_organiser(client)
    headers = _admin(client, db)
    before = len(get_mailer().outbox)
    client.post(f"{REQUESTS}/{_request_id(client, headers, 'neworg')}/approve", headers=headers)
    assert len(get_mailer().outbox) == before


def test_existing_organisers_without_a_request_are_approved(client, db):
    user = make_user(db, Role.ORGANISER)
    assert login(client, user.username)["user"]["role"] == "ORGANISER"


def test_only_admins_can_review_requests(client, db):
    customer = make_user(db)
    response = client.get(REQUESTS, headers=auth_header(client, customer.username))
    assert response.status_code == 403


def test_request_list_masks_personal_contact_details(client, db):
    _signup_organiser(client)
    headers = _admin(client, db)
    [item] = client.get(REQUESTS, headers=headers).json()["items"]
    assert item["emailMasked"] == "n***@gmail.com" and item["phoneMasked"] == "+65****4567"
    assert item["organisationEmail"] == "team@fanevents.sg" and item["emailVerified"] is False


# ----------------------------------------------------------------- login tabs


def test_unknown_username_on_customer_or_organiser_tab_offers_sign_up(client, db):
    for portal in ("CUSTOMER", "ORGANISER"):
        assert error_of(_login(client, "ghost", portal=portal))["code"] == "SIGNUP_REQUIRED"


def test_admin_tab_is_verification_only(client, db):
    customer = make_user(db)
    admin = make_user(db, Role.ADMIN)
    expected = {"code": "INVALID_CREDENTIALS", "message": "invalid password or username", "details": {}}
    assert error_of(_login(client, "ghost", portal="ADMIN")) == expected
    assert error_of(_login(client, customer.username, portal="ADMIN")) == expected
    assert error_of(_login(client, admin.username, "Wrong1!pass", portal="ADMIN")) == expected
    assert _login(client, admin.username, portal="ADMIN").status_code == 200


@pytest.mark.parametrize("role,portal", [(Role.CUSTOMER, "ORGANISER"), (Role.ORGANISER, "CUSTOMER"),
                                         (Role.ADMIN, "CUSTOMER")])
def test_wrong_tab_is_an_invalid_login_even_with_the_right_password(client, db, role, portal):
    user = make_user(db, role)
    response = _login(client, user.username, portal=portal)
    assert response.status_code == 401
    error = error_of(response)
    assert error["code"] == "INVALID_CREDENTIALS" and error["details"]["attemptsRemaining"] == 4


def test_right_tab_signs_in(client, db):
    for role, portal in ((Role.CUSTOMER, "CUSTOMER"), (Role.ORGANISER, "ORGANISER")):
        user = make_user(db, role)
        assert _login(client, user.username, portal=portal).status_code == 200


def test_changed_password_still_needs_the_right_tab(client, db):
    user = make_user(db, Role.CUSTOMER)
    token = login(client, user.username)["accessToken"]
    new_password = generate_password()
    client.post("/api/v1/auth/change-password", headers={"Authorization": f"Bearer {token}"},
                json={"currentPassword": PASSWORD, "newPassword": new_password})
    assert _login(client, user.username, new_password, portal="CUSTOMER").status_code == 200
    assert _login(client, user.username, new_password, portal="ORGANISER").status_code == 401
