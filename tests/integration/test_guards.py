"""Role guards, exercised on a minimal app so they are tested independently of feature routes."""

import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import auth
from app.core.config import get_settings
from app.core.deps import require_admin, require_customer, require_organiser
from app.core.errors import register_error_handlers
from app.core.security import generate_password
from app.db.models import Role
from app.services.admin_accounts import seed_admin
from tests.helpers import auth_header, error_of, login, make_user


@pytest.fixture
def guarded():
    app = FastAPI()
    register_error_handlers(app)
    router = APIRouter(prefix="/api/v1")
    router.include_router(auth.router)

    @router.get("/admin-only", dependencies=[Depends(require_admin)])
    def admin_only():
        return {"ok": True}

    @router.get("/organiser-only", dependencies=[Depends(require_organiser)])
    def organiser_only():
        return {"ok": True}

    @router.get("/customer-only", dependencies=[Depends(require_customer)])
    def customer_only():
        return {"ok": True}

    app.include_router(router)
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("role,allowed", [
    (Role.CUSTOMER, "/api/v1/customer-only"),
    (Role.ORGANISER, "/api/v1/organiser-only"),
])
def test_roles_only_reach_their_routes(guarded, db, role, allowed):
    user = make_user(db, role=role)
    headers = auth_header(guarded, user.username)
    for path in ("/api/v1/admin-only", "/api/v1/organiser-only", "/api/v1/customer-only"):
        response = guarded.get(path, headers=headers)
        if path == allowed:
            assert response.status_code == 200
        else:
            assert response.status_code == 403 and error_of(response)["code"] == "FORBIDDEN"


def test_unauthenticated_requests_are_denied(guarded):
    for path in ("/api/v1/admin-only", "/api/v1/organiser-only", "/api/v1/customer-only"):
        assert error_of(guarded.get(path))["code"] == "AUTH_REQUIRED"


def test_seeded_admin_blocked_until_password_changed(guarded, db):
    printed: list[str] = []
    seed_admin(db, get_settings(), out=printed.append)
    password = next(l.split("Password: ")[1] for l in printed[0].splitlines() if "Password: " in l)
    body = login(guarded, "eventeaseadmin", password)
    headers = {"Authorization": f"Bearer {body['accessToken']}"}

    blocked = guarded.get("/api/v1/admin-only", headers=headers)
    assert blocked.status_code == 403
    assert error_of(blocked)["code"] == "PASSWORD_CHANGE_REQUIRED"
    assert error_of(blocked)["details"]["redirectTo"] == "/admin/change-password"

    changed = guarded.post("/api/v1/auth/change-password", headers=headers,
                           json={"currentPassword": password, "newPassword": generate_password()})
    assert changed.status_code == 200
    headers = {"Authorization": f"Bearer {changed.json()['accessToken']}"}
    assert guarded.get("/api/v1/admin-only", headers=headers).status_code == 200


def test_suspended_user_token_stops_working(guarded, db):
    from app.db.models import UserStatus

    user = make_user(db, role=Role.CUSTOMER)
    headers = auth_header(guarded, user.username)
    user.status = UserStatus.SUSPENDED
    db.commit()
    assert error_of(guarded.get("/api/v1/customer-only", headers=headers))["code"] == "ACCOUNT_SUSPENDED"
