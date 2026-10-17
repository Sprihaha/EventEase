"""Shared test helpers. Test passwords are generated at runtime, never hard-coded."""

import itertools
from functools import lru_cache

from app.core.security import generate_password, hash_password
from app.db.models import Role, User

PASSWORD = generate_password(16)
_counter = itertools.count(1)


@lru_cache
def password_hash() -> str:
    return hash_password(PASSWORD)


def unique_name(prefix: str = "user") -> str:
    return f"{prefix}{next(_counter)}"[:15]


def make_user(db, role: Role = Role.CUSTOMER, username: str | None = None, **fields) -> User:
    username = username or unique_name(role.value.lower()[:4])
    user = User(
        username=username,
        email=fields.pop("email", None if role == Role.ADMIN else f"{username}@example.com"),
        phone_e164=fields.pop("phone_e164", None if role == Role.ADMIN else "+6591234567"),
        password_hash=fields.pop("password_hash", password_hash()),
        role=role,
        **fields,
    )
    db.add(user)
    db.commit()
    return user


def login(client, identifier: str, password: str = PASSWORD) -> dict:
    response = client.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def auth_header(client, identifier: str, password: str = PASSWORD) -> dict:
    return {"Authorization": f"Bearer {login(client, identifier, password)['accessToken']}"}


def error_of(response) -> dict:
    return response.json()["error"]
