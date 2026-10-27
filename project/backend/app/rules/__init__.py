"""Pure validation rules for usernames, passwords, emails and phone numbers.

Each validator raises RuleError (code, message, status) for the first failing rule.
"""

from app.rules.errors import RuleError

__all__ = ["RuleError"]
