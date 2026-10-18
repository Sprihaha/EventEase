import uuid
from datetime import datetime

from pydantic import Field

from app.db.models import Role
from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    identifier: str = Field(..., min_length=1, max_length=254, description="Username or email address")
    password: str = Field(..., min_length=1, max_length=1024)


class SignupRequest(CamelModel):
    # Loose limits here; the precise rules (and their error codes) live in app.rules.
    username: str = Field(..., max_length=1000)
    password: str = Field(..., max_length=1024)
    email: str = Field(..., max_length=320)
    phone: str = Field(..., max_length=32)
    role: str = Field(..., max_length=32, description="CUSTOMER or ORGANISER")


class ForgotPasswordRequest(CamelModel):
    identifier: str = Field(..., min_length=1, max_length=254)


class ResetPasswordRequest(CamelModel):
    token: str = Field(..., min_length=10, max_length=200)
    new_password: str = Field(..., max_length=1024)


class ChangePasswordRequest(CamelModel):
    current_password: str = Field(..., min_length=1, max_length=1024)
    new_password: str = Field(..., max_length=1024)


class UserSummary(CamelModel):
    id: uuid.UUID
    username: str
    role: Role


class AuthResponse(CamelModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserSummary
    redirect_to: str
    must_change_password: bool = False


class MeResponse(CamelModel):
    id: uuid.UUID
    username: str
    role: Role
    email: str | None
    phone: str | None
    must_change_password: bool
    created_at: datetime


class UsernameAvailability(CamelModel):
    username: str
    available: bool
