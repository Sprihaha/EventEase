import secrets
import os
import warnings
from functools import lru_cache
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import model_validator
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: Literal["development", "test", "production"] = "development"
    LOCAL_SANDBOX: bool = False
    LOCAL_ONLY: bool = False
    LOG_LEVEL: str = "INFO"

    # Database: either DATABASE_URL or the individual DB_* settings.
    DATABASE_URL: str | None = None
    DB_USER: str | None = None
    DB_PASSWORD: str | None = None
    DB_HOST: str | None = None
    DB_PORT: int = 5432
    DB_NAME: str | None = None
    DB_SSLMODE: str = "require"
    # Postgres schema holding the EventEase tables. Tests use an isolated schema.
    DB_SCHEMA: str = "public"
    SQL_ECHO: bool = False
    # Keep pool_size + max_overflow below the database/pooler client limit
    # (Supabase session pooler: 15 clients per project on small plans).
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5

    # Auth
    JWT_SECRET: str | None = None
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "eventease"
    ACCESS_TOKEN_TTL_MINUTES: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 7
    REFRESH_COOKIE_NAME: str = "eventease_refresh"
    COOKIE_SECURE: bool | None = None
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] | None = None
    PASSWORD_RESET_TTL_MINUTES: int = 30
    LOGIN_MAX_FAILURES: int = 5
    LOCKOUT_MINUTES: int = 15

    # Rate limits ("<count>/<seconds>")
    RATE_LIMIT_ENABLED: bool = True
    RATE_LOGIN_IP: str = "20/60"
    RATE_LOGIN_IDENTIFIER: str = "10/60"
    RATE_SIGNUP_IP: str = "10/3600"
    RATE_FORGOT_IP: str = "5/900"
    # Per account (or unknown identifier) per Singapore calendar day, stored in the database.
    PASSWORD_RESET_DAILY_LIMIT: int = Field(default=3, ge=1, le=50)
    RATE_RESET_IP: str = "10/900"
    RATE_USERNAME_CHECK_IP: str = "60/60"
    RATE_REFRESH_IP: str = "30/60"
    RATE_BOOKING_USER: str = "20/60"

    # CORS / frontend
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:8000,http://localhost:8443,"
        "https://eventease-frontend-invd.onrender.com,"
        "https://eventease-frontend.onrender.com"
    )
    CORS_ORIGIN_REGEX: str = r"https://([a-z0-9-]+\.)*onrender\.com"
    # Links in emails point here; defaults to live Render frontend or local Vite 8443
    FRONTEND_URL: str = "https://eventease-frontend.onrender.com"


    # Default administrator
    ADMIN_USERNAME: str = "eventeaseadmin"
    ADMIN_PASSWORD: str | None = None
    AUTO_SEED_ADMIN: bool = True
    # Deliberately disabled until a prototype operator explicitly enables it.
    DEMO_RESET_ENABLED: bool = False
    ALLOW_PRODUCTION_DEMO_RESET: bool = False

    # Events / ingestion
    TICKETMASTER_API_KEY: str | None = None
    TICKETMASTER_MAX_PAGES: int = 5
    INGEST_AUTO_APPROVE: bool = True
    INCLUDE_SAMPLE_EVENTS: bool | None = None
    IMPORT_MAX_BYTES: int = 2_000_000
    IMPORT_MAX_ROWS: int = 1000
    # Organiser venue layouts (uploads reuse IMPORT_MAX_BYTES as the file size limit).
    VENUE_MAX_SEATS: int = Field(default=20_000, ge=1, le=200_000)

    # Bookings
    CURRENCY: str = "SGD"
    TIMEZONE: str = "Asia/Singapore"
    PURCHASE_LIMIT_PER_EVENT: int = 6
    BOOKING_HOLD_MINUTES: int = 10
    CANCELLATION_CUTOFF_HOURS: int = 48
    BACKGROUND_JOBS_ENABLED: bool = True
    HOLD_SWEEP_INTERVAL_SECONDS: int = 30

    # EaseXchange policy, independent of Package B's booking hold duration.
    EXCHANGE_REQUEST_TTL_HOURS: int = Field(default=168, ge=1, le=8760)
    EXCHANGE_MATCH_TTL_MINUTES: int = Field(default=30, ge=1, le=1440)

    # Payments
    PAYMENT_PROVIDER: Literal["mock", "stripe"] = "mock"
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None

    # Mail. "console" prints messages; "resend" and "sendgrid" use HTTPS REST APIs;
    # "smtp" sends real mail (e.g. Gmail: smtp.gmail.com, port 587 with STARTTLS or 465 with SSL).
    MAIL_TRANSPORT: Literal["console", "resend", "sendgrid", "smtp"] = "console"
    MAIL_FROM: str = "EventEase <no-reply@eventease.local>"
    RESEND_API_KEY: str | None = None
    SENDGRID_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_SECONDS: int = 15

    # Email verification: required for new sign-ups; accounts created earlier get reminders.
    EMAIL_VERIFICATION_TTL_HOURS: int = Field(default=24, ge=1, le=720)
    EMAIL_REMINDER_TTL_DAYS: int = Field(default=7, ge=1, le=60)
    RATE_VERIFY_EMAIL_IP: str = "20/900"
    RATE_RESEND_VERIFICATION_IP: str = "5/900"
    RATE_RESEND_VERIFICATION_IDENTIFIER: str = "3/3600"

    # Fraud thresholds
    FRAUD_FAILED_LOGINS_PER_IP: int = 10
    FRAUD_DISTINCT_IDENTIFIERS_PER_IP: int = 5
    FRAUD_LOGIN_WINDOW_MINUTES: int = 15
    FRAUD_SHARED_PHONE_ACCOUNTS: int = 2
    FRAUD_SIGNUPS_PER_IP: int = 3
    FRAUD_SIGNUP_WINDOW_MINUTES: int = 60
    FRAUD_BULK_TICKETS_PER_WINDOW: int = 6
    FRAUD_BULK_BOOKINGS_PER_WINDOW: int = 3
    FRAUD_BULK_IP_BOOKINGS_PER_WINDOW: int = 5
    FRAUD_BULK_WINDOW_MINUTES: int = 10
    FRAUD_CANCELLATION_MIN_COUNT: int = 3
    FRAUD_CANCELLATION_RATE: float = 0.5
    FRAUD_CANCELLATION_WINDOW_DAYS: int = 30
    FRAUD_PAYMENT_FAILURES: int = 3
    FRAUD_PAYMENT_WINDOW_MINUTES: int = 60
    FRAUD_MAX_PRICE_CENTS: int = 200_000
    FRAUD_PRICE_SPREAD_FACTOR: int = 10
    FRAUD_REJECTIONS: int = 3
    FRAUD_REJECTION_WINDOW_DAYS: int = 30

    # PDPA: retention for login attempts and signup IPs
    DATA_RETENTION_DAYS: int = 90

    @model_validator(mode="after")
    def _check(self) -> "Settings":
        if self.LOCAL_SANDBOX or self.LOCAL_ONLY:
            url = make_url(self.database_url)
            host = url.query.get("host", url.host or "")
            if not (host in ("localhost", "127.0.0.1", "::1") or str(host).startswith("/")):
                raise ValueError("local mode refuses a nonlocal database")
            if self.APP_ENV == "production" or self.PAYMENT_PROVIDER != "mock":
                raise ValueError("local mode requires development/test and simulated payments")
        if self.DB_SCHEMA != "public" and not self.DB_SCHEMA.replace("_", "").isalnum():
            raise ValueError("DB_SCHEMA must be alphanumeric/underscore")
        if self.is_production and not self.JWT_SECRET:
            raise ValueError("JWT_SECRET must be set in production")
        if self.JWT_SECRET and len(self.JWT_SECRET) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        if self.PAYMENT_PROVIDER == "stripe" and not self.STRIPE_SECRET_KEY:
            raise ValueError("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe")
        if self.MAIL_TRANSPORT == "smtp" and not (self.SMTP_HOST and (self.SMTP_USERNAME or self.SMTP_USER) and self.SMTP_PASSWORD):
            raise ValueError("SMTP_HOST, SMTP_USERNAME and SMTP_PASSWORD are required when MAIL_TRANSPORT=smtp")
        if self.MAIL_TRANSPORT == "resend" and not self.RESEND_API_KEY:
            raise ValueError("RESEND_API_KEY is required when MAIL_TRANSPORT=resend")
        if self.MAIL_TRANSPORT == "sendgrid" and not self.SENDGRID_API_KEY:
            raise ValueError("SENDGRID_API_KEY is required when MAIL_TRANSPORT=sendgrid")
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def database_is_local(self) -> bool:
        """Classify configuration only; never resolve DNS or open a connection."""
        url = make_url(self.database_url)
        host = str(url.query.get("host", url.host or ""))
        # The project's Compose service is named db. Unknown/network hosts are
        # conservatively treated as real databases, even in development mode.
        return (host in ("localhost", "127.0.0.1", "::1", "db") or host.startswith("/")) and not url.query.get("hostaddr")

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.TIMEZONE)

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cookie_secure(self) -> bool:
        return self.is_production if self.COOKIE_SECURE is None else self.COOKIE_SECURE

    @property
    def cookie_samesite(self) -> str:
        # The frontend and API live on different sites in production, so the
        # refresh cookie must be SameSite=None (which requires Secure).
        if self.COOKIE_SAMESITE:
            return self.COOKIE_SAMESITE
        return "none" if self.is_production else "lax"

    @property
    def include_sample_events(self) -> bool:
        if self.INCLUDE_SAMPLE_EVENTS is None:
            return not self.is_production
        return self.INCLUDE_SAMPLE_EVENTS and not self.is_production

    @property
    def database_url(self) -> str | URL:
        if self.DATABASE_URL:
            return self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
        missing = [
            name
            for name in ("DB_USER", "DB_PASSWORD", "DB_HOST", "DB_NAME")
            if not getattr(self, name)
        ]
        if missing:
            raise RuntimeError(f"Missing database settings: {', '.join(missing)}")
        return URL.create(
            drivername="postgresql+psycopg2",
            username=self.DB_USER,
            password=self.DB_PASSWORD,
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
        )


def _sanitise_database_url(url: str) -> str:
    """Normalise a Supabase (or any PostgreSQL) DATABASE_URL for use inside Docker.

    Supabase connection strings sometimes include ``sslmode=verify-full`` and
    ``sslrootcert=/root/.postgresql/postgresql.crt``.  When the container runs
    as a non-root user (uid 10001) that path is unreadable, crashing startup.
    We downgrade to ``sslmode=require`` (still encrypted, no cert file needed)
    and strip any explicit ``sslrootcert`` parameter so the driver does not try
    to open a file it cannot read.
    """
    from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

    url = url.replace("postgres://", "postgresql://", 1)
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)

    # Downgrade verify-full / verify-ca -> require; keep require / prefer / disable as-is.
    ssl_mode = params.get("sslmode", ["require"])[0]
    if ssl_mode in ("verify-full", "verify-ca"):
        params["sslmode"] = ["require"]

    # Remove the cert-file pointer — it points to /root/ which non-root users cannot read.
    params.pop("sslrootcert", None)

    new_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=new_query))


_ephemeral_secret: str | None = None


def jwt_secret(settings: "Settings") -> str:
    """Return the JWT secret; outside production a missing secret gets a per-process random one."""
    global _ephemeral_secret
    if settings.JWT_SECRET:
        return settings.JWT_SECRET
    if _ephemeral_secret is None:
        warnings.warn("JWT_SECRET not set; using a random per-process secret (dev only)")
        _ephemeral_secret = secrets.token_urlsafe(48)
    return _ephemeral_secret


@lru_cache
def get_settings() -> Settings:
    local = any(os.environ.get(key) == "true" for key in ("LOCAL_SANDBOX", "LOCAL_ONLY"))
    return Settings(_env_file=None) if local else Settings()


def parse_rate(spec: str) -> tuple[int, int]:
    count, seconds = spec.split("/")
    return int(count), int(seconds)
