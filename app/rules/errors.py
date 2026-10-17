from app.core.errors import AppError


class RuleError(AppError):
    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        super().__init__(status_code, code, message, details)
