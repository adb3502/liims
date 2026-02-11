"""In-memory sliding-window rate limiter and account lockout.

Usage as a FastAPI dependency:

    from app.core.rate_limit import RateLimiter

    @router.post("/login")
    async def login(
        request: Request,
        _rl: None = Depends(RateLimiter(max_calls=5, window_seconds=60, key="login", by="ip")),
    ):
        ...
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status


class _SlidingWindowCounter:
    """Thread-safe sliding window rate counter."""

    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def is_allowed(self, key: str, max_calls: int, window_seconds: int) -> bool:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            timestamps = self._windows[key]
            # Remove expired entries
            self._windows[key] = [t for t in timestamps if t > cutoff]
            if len(self._windows[key]) >= max_calls:
                return False
            self._windows[key].append(now)
            return True

    def record(self, key: str) -> None:
        """Record an event without checking limits (for lockout tracking)."""
        now = time.monotonic()
        with self._lock:
            self._windows[key].append(now)

    def count(self, key: str, window_seconds: int) -> int:
        """Count events within the window."""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            self._windows[key] = [t for t in self._windows.get(key, []) if t > cutoff]
            return len(self._windows[key])

    def clear(self, key: str) -> None:
        """Clear all events for a key (e.g. on successful login)."""
        with self._lock:
            self._windows.pop(key, None)

    def cleanup(self, older_than_seconds: int = 300) -> None:
        """Remove stale keys to prevent unbounded memory growth."""
        now = time.monotonic()
        cutoff = now - older_than_seconds
        with self._lock:
            stale_keys = [
                k for k, v in self._windows.items()
                if not v or v[-1] < cutoff
            ]
            for k in stale_keys:
                del self._windows[k]


# Module-level singleton
_counter = _SlidingWindowCounter()


# --- Account Lockout ---

LOGIN_LOCKOUT_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_WINDOW_SECONDS = 900  # 15 minutes


def record_failed_login(email: str) -> None:
    """Record a failed login attempt for an email address."""
    key = f"login_fail:{email.lower()}"
    _counter.record(key)


def clear_failed_logins(email: str) -> None:
    """Clear failed login attempts on successful login."""
    key = f"login_fail:{email.lower()}"
    _counter.clear(key)


def is_account_locked(email: str) -> bool:
    """Check if an account is locked out due to too many failed attempts."""
    key = f"login_fail:{email.lower()}"
    return _counter.count(key, LOGIN_LOCKOUT_WINDOW_SECONDS) >= LOGIN_LOCKOUT_MAX_ATTEMPTS


class RateLimiter:
    """FastAPI dependency that enforces per-key rate limits.

    Parameters:
        max_calls: Maximum number of calls within the window.
        window_seconds: Sliding window duration in seconds.
        key: A string prefix to namespace this limiter (e.g. "login").
        by: "ip" to key by client IP, or "user" to key by authenticated user ID.
    """

    def __init__(
        self,
        max_calls: int,
        window_seconds: int = 60,
        key: str = "default",
        by: str = "ip",
    ) -> None:
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self.key = key
        self.by = by

    async def __call__(self, request: Request) -> None:
        if self.by == "user":
            # Requires that get_current_user has already populated request.state
            user = getattr(request.state, "current_user", None)
            identifier = str(user.id) if user and hasattr(user, "id") else self._get_ip(request)
        else:
            identifier = self._get_ip(request)

        rate_key = f"{self.key}:{identifier}"

        if not _counter.is_allowed(rate_key, self.max_calls, self.window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {self.max_calls} requests per {self.window_seconds} seconds.",
            )

    @staticmethod
    def _get_ip(request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Use the rightmost (last) IP, which is set by the trusted reverse proxy.
            # The leftmost IP is client-supplied and can be spoofed.
            return forwarded.split(",")[-1].strip()
        if request.client:
            return request.client.host
        return "unknown"
