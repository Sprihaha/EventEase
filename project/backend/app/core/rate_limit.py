"""In-memory sliding-window rate limiter.

Suitable for a single API instance (the Render free tier). Account lockout is
stored in the database, so it holds across instances regardless.
"""

import threading
import time
from collections import defaultdict, deque

from app.core.config import get_settings, parse_rate
from app.core.errors import AppError


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._calls = 0

    def hit(self, key: str, limit: int, window_seconds: int) -> int | None:
        """Record a hit; return seconds to wait if the limit is exceeded, else None."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                return max(1, int(hits[0] + window_seconds - now) + 1)
            hits.append(now)
            self._calls += 1
            if self._calls % 1000 == 0:
                self._prune(now)
            return None

    def _prune(self, now: float) -> None:
        for key in [k for k, v in self._hits.items() if not v or v[-1] < now - 86400]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def enforce(bucket: str, key: str | None, spec: str) -> None:
    settings = get_settings()
    if not settings.RATE_LIMIT_ENABLED or not key:
        return
    limit, window = parse_rate(spec)
    retry_after = limiter.hit(f"{bucket}:{key.lower()}", limit, window)
    if retry_after is not None:
        raise AppError(
            429,
            "RATE_LIMITED",
            "too many requests, please try again later",
            {"retryAfterSeconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )
