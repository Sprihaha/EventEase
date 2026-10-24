import pytest
from sqlalchemy import select

from app.db.models import Role, User
from app.rules.errors import RuleError
from tests.helpers import PASSWORD, login, make_user


def _reload(db, user: User) -> User:
    db.expire_all()
    return db.get(User, user.id)


@pytest.mark.parametrize("before,after", [
    (Role.CUSTOMER, Role.ORGANISER),
    (Role.ORGANISER, Role.CUSTOMER),
    (Role.CUSTOMER, Role.ADMIN),
    (Role.ORGANISER, Role.ADMIN),
    (Role.ADMIN, Role.CUSTOMER),
])
def test_role_can_never_change_after_creation(db, before, after):
    user = make_user(db, before)
    user.role = after
    with pytest.raises(RuleError) as info:
        db.commit()
    assert (info.value.code, info.value.status_code) == ("ROLE_IMMUTABLE", 403)
    db.rollback()
    assert _reload(db, user).role == before


def test_other_fields_still_change(db):
    user = make_user(db, Role.ORGANISER)
    user.phone_e164 = "+6598765432"
    db.commit()
    assert _reload(db, user).phone_e164 == "+6598765432"


@pytest.mark.parametrize("role", ["CUSTOMER", "ORGANISER"])
def test_role_is_set_once_at_sign_up(client, db, role):
    response = client.post("/api/v1/auth/signup", json={"username": "newfan", "password": PASSWORD,
                                                         "email": "newfan@gmail.com", "phone": "91234567",
                                                         "role": role, "organisationName": "Fan Events",
                                                         "organisationEmail": "team@fanevents.sg"})
    assert response.status_code == 201
    assert db.scalar(select(User).where(User.username == "newfan")).role == role


def test_client_cannot_choose_a_different_role_at_login(client, db):
    user = make_user(db, Role.CUSTOMER)
    response = client.post("/api/v1/auth/login", json={"identifier": user.username, "password": PASSWORD,
                                                        "role": "ORGANISER"})
    assert response.json()["user"]["role"] == "CUSTOMER"
    assert login(client, user.username)["user"]["role"] == "CUSTOMER"
