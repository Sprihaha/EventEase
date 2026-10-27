"""provision the three EventEase role accounts with Argon2id hashes

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-18 18:30:00.000000

This data migration runs only in production. Passwords are represented solely by
independently salted Argon2id hashes; no plaintext credential is stored here.
"""
import os
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACCOUNTS = (
    ("Janice", None, "ADMIN", "$argon2id$v=19$m=65536,t=3,p=4$d32piU1U6WFIycxK+ch50Q$6u3jzWzywclnOj6FoMDB8hK1waAVLvv1bCeuvhcax74"),
    ("John", "john@eventease.local", "CUSTOMER", "$argon2id$v=19$m=65536,t=3,p=4$v/HCG/YQbRXbJf2yMXTlSw$aS+C7WiEUH/HS9Ptq4UF7SbssM8QIvBWYo1NPxR0E7Y"),
    ("Jay", "jay@eventease.local", "ORGANISER", "$argon2id$v=19$m=65536,t=3,p=4$4ZNQD6VLWe/eNplSFkvN0Q$KAqLyVAhfKvcwReVlM7qsS/ZoZG3uv+5L19RNVluBpY"),
)


def upgrade() -> None:
    if os.getenv("APP_ENV") != "production":
        return

    connection = op.get_bind()
    for username, email, role, password_hash in _ACCOUNTS:
        user_id = connection.execute(
            sa.text("SELECT id FROM users WHERE lower(username) = lower(:username)"),
            {"username": username},
        ).scalar_one_or_none()

        if user_id is None:
            connection.execute(
                sa.text(
                    """
                    INSERT INTO users (
                        id, username, email, phone_e164, password_hash, role,
                        status, must_change_password, token_version,
                        failed_login_count, locked_until, password_changed_at,
                        suspended_reason, signup_ip
                    ) VALUES (
                        :id, :username, :email, NULL, :password_hash, :role,
                        'ACTIVE', false, 0, 0, NULL, now(), NULL, NULL
                    )
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,
                    "role": role,
                },
            )
            continue

        connection.execute(
            sa.text(
                """
                UPDATE users
                   SET password_hash = :password_hash,
                       role = :role,
                       email = CASE WHEN :email IS NULL THEN email ELSE COALESCE(email, :email) END,
                       status = 'ACTIVE',
                       must_change_password = false,
                       token_version = token_version + 1,
                       failed_login_count = 0,
                       locked_until = NULL,
                       password_changed_at = now(),
                       suspended_reason = NULL,
                       updated_at = now()
                 WHERE id = :id
                """
            ),
            {"id": user_id, "email": email, "password_hash": password_hash, "role": role},
        )
        connection.execute(
            sa.text(
                "UPDATE refresh_tokens SET revoked_at = now() "
                "WHERE user_id = :id AND revoked_at IS NULL"
            ),
            {"id": user_id},
        )


def downgrade() -> None:
    # Account data may be referenced by bookings, events, and audit logs. A
    # downgrade intentionally preserves it rather than cascading user data.
    pass
