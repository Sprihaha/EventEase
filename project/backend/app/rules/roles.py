"""An account's role is chosen once, at sign-up (or seeding), and never changes.

A customer never becomes an organiser or admin, and vice versa. The ORM guard in
app.db.models.user enforces this for every flush.
"""

from app.rules.errors import RuleError

ROLE_IMMUTABLE = ("ROLE_IMMUTABLE", "an account's role cannot be changed after sign-up")


def role_change_error() -> RuleError:
    return RuleError(*ROLE_IMMUTABLE, status_code=403)
