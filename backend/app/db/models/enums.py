from enum import StrEnum


class Role(StrEnum):
    CUSTOMER = "CUSTOMER"
    ORGANISER = "ORGANISER"
    ADMIN = "ADMIN"


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class EventCategory(StrEnum):
    # Stored as plain text (no DB constraint) so new categories need no migration.
    CONCERT = "CONCERT"
    THEATRE = "THEATRE"
    SPORTS = "SPORTS"
    CULTURAL = "CULTURAL"


class EventStatus(StrEnum):
    REVIEW_IN_PROGRESS = "REVIEW_IN_PROGRESS"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"


class EventOrigin(StrEnum):
    EXTERNAL = "EXTERNAL"
    ORGANISER = "ORGANISER"


class SourceKind(StrEnum):
    API = "API"
    MANUAL = "MANUAL"


class TicketCategoryType(StrEnum):
    VIP = "VIP"
    STANDARD = "STANDARD"
    CONCESSION = "CONCESSION"
    SPECIAL_ASSISTANCE = "SPECIAL_ASSISTANCE"


class BookingStatus(StrEnum):
    PENDING_PAYMENT = "PENDING_PAYMENT"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class TicketStatus(StrEnum):
    VALID = "VALID"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class PaymentKind(StrEnum):
    CHARGE = "CHARGE"
    REFUND = "REFUND"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class FraudSignalType(StrEnum):
    CREDENTIAL_STUFFING = "CREDENTIAL_STUFFING"
    ACCOUNT_FAILED_LOGINS = "ACCOUNT_FAILED_LOGINS"
    SHARED_PHONE = "SHARED_PHONE"
    RAPID_SIGNUPS_IP = "RAPID_SIGNUPS_IP"
    BULK_BUYING = "BULK_BUYING"
    HIGH_CANCELLATION_RATE = "HIGH_CANCELLATION_RATE"
    REPEATED_PAYMENT_FAILURES = "REPEATED_PAYMENT_FAILURES"
    ABNORMAL_PRICING = "ABNORMAL_PRICING"
    REPEATED_REJECTIONS = "REPEATED_REJECTIONS"


class FraudSeverity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class FraudStatus(StrEnum):
    OPEN = "OPEN"
    REVIEWED = "REVIEWED"
    DISMISSED = "DISMISSED"
