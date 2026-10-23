from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import check_origin, client_ip, get_current_user
from app.core.rate_limit import enforce
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    UsernameAvailability,
    VerifyEmailRequest,
)
from app.rules.contact import mask_email
from app.schemas.common import Message
from app.services import auth as auth_service
from app.services import email_verification
from app.services.usernames import check_username_available

router = APIRouter(prefix="/auth", tags=["Auth"])

def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        token,
        max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/api/v1/auth",
                           secure=settings.cookie_secure, samesite=settings.cookie_samesite, httponly=True)


def _respond(response: Response, session: auth_service.Session_) -> dict:
    _set_refresh_cookie(response, session.refresh_token)
    return session.body()


@router.post(
    "/login",
    response_model=AuthResponse,
    responses={404: {"description": "SIGNUP_REQUIRED"}, 401: {"description": "INVALID_CREDENTIALS"},
               423: {"description": "ACCOUNT_LOCKED"}, 429: {"description": "RATE_LIMITED"}},
)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    settings = get_settings()
    ip = client_ip(request)
    enforce("login-ip", ip, settings.RATE_LOGIN_IP)
    enforce("login-id", body.identifier.strip(), settings.RATE_LOGIN_IDENTIFIER)
    return _respond(response, auth_service.login(db, settings, body.identifier, body.password, ip))


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED,
             responses={400: {"description": "Rule violation"}, 403: {"description": "ROLE_NOT_ALLOWED"},
                        409: {"description": "USERNAME_TAKEN / EMAIL_TAKEN"}})
def signup(body: SignupRequest, request: Request, db: Session = Depends(get_db)):
    """Creates an unverified account and emails a verification link; log in after opening it."""
    settings = get_settings()
    ip = client_ip(request)
    enforce("signup-ip", ip, settings.RATE_SIGNUP_IP)
    user = auth_service.signup(db, settings, username=body.username, password=body.password, email=body.email,
                               phone=body.phone, role=body.role, ip=ip)
    return {"message": "Account created. Open the link we emailed you to verify your address, then sign in.",
            "email": mask_email(user.email)}


@router.post("/verify-email", response_model=Message, responses={400: {"description": "VERIFICATION_LINK_INVALID"}})
def verify_email(body: VerifyEmailRequest, request: Request, db: Session = Depends(get_db)):
    enforce("verify-email-ip", client_ip(request), get_settings().RATE_VERIFY_EMAIL_IP)
    email_verification.verify_email(db, body.token)
    return {"message": "Email verified. You can now sign in."}


@router.post("/resend-verification", response_model=Message)
def resend_verification(body: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    settings = get_settings()
    enforce("resend-verification-ip", client_ip(request), settings.RATE_RESEND_VERIFICATION_IP)
    enforce("resend-verification-id", body.identifier.strip(), settings.RATE_RESEND_VERIFICATION_IDENTIFIER)
    email_verification.resend_verification(db, settings, body.identifier)
    return {"message": "If that account still needs verifying, a new link has been sent to its email address."}


@router.get("/username-available", response_model=UsernameAvailability,
            responses={400: {"description": "Format rule violation"}, 409: {"description": "USERNAME_TAKEN"}})
def username_available(request: Request, username: str = Query(..., max_length=1000), db: Session = Depends(get_db)):
    enforce("username-check-ip", client_ip(request), get_settings().RATE_USERNAME_CHECK_IP)
    check_username_available(db, username)
    return {"username": username, "available": True}


@router.post("/forgot-password", response_model=Message,
             responses={404: {"description": "USER_NOT_FOUND"},
                        400: {"description": "INVALID_EMAIL (not this account's verified email)"},
                        403: {"description": "RESET_NOT_AVAILABLE / ACCOUNT_SUSPENDED"},
                        429: {"description": "TOO_MANY_RESET_REQUESTS (daily limit) / RATE_LIMITED (per IP)"}})
def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    settings = get_settings()
    ip = client_ip(request)
    enforce("forgot-ip", ip, settings.RATE_FORGOT_IP)
    auth_service.forgot_password(db, settings, body.username, body.email, ip)
    return {"message": "A password reset link has been sent to your verified email address."}


@router.post("/reset-password", response_model=AuthResponse,
             responses={400: {"description": "RESET_TOKEN_INVALID / WEAK_PASSWORD"},
                        403: {"description": "ACCOUNT_SUSPENDED / ACCOUNT_PROTECTED"}})
def reset_password(body: ResetPasswordRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Sets the new password, signs out every other session and signs this browser in."""
    settings = get_settings()
    enforce("reset-ip", client_ip(request), settings.RATE_RESET_IP)
    session = auth_service.reset_password(db, settings, body.token, body.new_password)
    return _respond(response, session)


@router.post("/refresh", response_model=AuthResponse, dependencies=[Depends(check_origin)])
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    settings = get_settings()
    enforce("refresh-ip", client_ip(request), settings.RATE_REFRESH_IP)
    session = auth_service.refresh_session(db, settings, request.cookies.get(settings.REFRESH_COOKIE_NAME))
    return _respond(response, session)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(check_origin)])
def logout(request: Request, db: Session = Depends(get_db)):
    auth_service.logout(db, request.cookies.get(get_settings().REFRESH_COOKIE_NAME))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return MeResponse(id=user.id, username=user.username, role=user.role, email=user.email, phone=user.phone_e164,
                      must_change_password=user.must_change_password,
                      email_verified=user.email_verified_at is not None, created_at=user.created_at)


@router.post("/change-password", response_model=AuthResponse)
def change_password(body: ChangePasswordRequest, request: Request, response: Response,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = auth_service.change_password(db, get_settings(), user, body.current_password, body.new_password,
                                           client_ip(request))
    return _respond(response, session)
