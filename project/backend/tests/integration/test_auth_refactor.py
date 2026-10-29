import os
import sys
import uuid

sys.path.insert(0, os.path.abspath("."))

from app.core.config import get_settings
from app.db.models import Role, User, UserStatus
from app.db.session import SessionLocal
from app.services import auth as auth_service
from app.services.mail.base import get_mailer


def test_auth_srp_refactor():
    settings = get_settings()
    suffix = "".join(c for c in uuid.uuid4().hex if c != "9")[:6]
    username = f"usr{suffix}"
    email = f"test_{suffix}@example.com"
    password = "TestPassword123!"
    new_password = "NewPassword456@"

    with SessionLocal() as db:
        # 1. Test Signup Module
        user = auth_service.signup(
            db,
            settings,
            username=username,
            password=password,
            email=email,
            phone="91234567",
            role="CUSTOMER",
            ip="127.0.0.1",
        )
        db.commit()
        assert user.id is not None
        assert user.username == username
        assert user.email_verification_required is True

        # Verify email dispatch
        mailer = get_mailer()
        signup_emails = [m for m in mailer.outbox if m.to == email and "verify" in m.subject.lower()]
        assert len(signup_emails) >= 1

        # Simulate email verification
        user.email_verified_at = user.created_at
        user.status = UserStatus.ACTIVE
        db.commit()

        # 2. Test Login Module
        session = auth_service.login(
            db,
            settings,
            identifier=username,
            password=password,
            ip="127.0.0.1",
            portal=Role.CUSTOMER,
        )
        assert session.access_token is not None
        assert session.refresh_token is not None
        assert session.user.id == user.id

        body = session.body()
        assert body["user"]["username"] == username
        assert body["redirect_to"] == "/customer/dashboard"

        # 3. Test Sessions Module (Refresh Token Rotation)
        refreshed = auth_service.refresh_session(db, settings, session.refresh_token)
        assert refreshed.access_token is not None
        assert refreshed.refresh_token != session.refresh_token

        # 4. Test Passwords Module (Change Password)
        changed_session = auth_service.change_password(
            db,
            settings,
            user,
            current=password,
            new=new_password,
            ip="127.0.0.1",
        )
        assert changed_session.access_token is not None

        # Verify login with old password fails
        login_failed = False
        try:
            auth_service.login(db, settings, identifier=username, password=password, ip="127.0.0.1")
        except Exception:
            login_failed = True
        assert login_failed is True

        # Verify login with new password succeeds
        new_session = auth_service.login(db, settings, identifier=username, password=new_password, ip="127.0.0.1")
        assert new_session.user.id == user.id

        # 5. Test Passwords Module (Forgot & Reset Password)
        auth_service.forgot_password(db, settings, username=username, email=email, ip="127.0.0.1")
        reset_emails = [m for m in mailer.outbox if m.to == email and "reset" in m.subject.lower()]
        assert len(reset_emails) >= 1

        # Extract token from email
        email_body = reset_emails[-1].body
        token = email_body.split("token=")[1].split()[0]

        final_password = "FinalPassword789#"
        reset_session = auth_service.reset_password(db, settings, token=token, new_password=final_password)
        assert reset_session.user.id == user.id

        # 6. Test Sessions Module (Logout)
        auth_service.logout(db, reset_session.refresh_token)

        print("All Auth SRP Refactor tests PASSED successfully!")


if __name__ == "__main__":
    test_auth_srp_refactor()
