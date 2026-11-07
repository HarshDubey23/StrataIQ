"""Per-client request limits, so one visitor cannot burn CPU, paid APIs or the public map services."""
from __future__ import annotations

import hmac
import re
import time

from fastapi import Request

from .config import get_settings

# First match wins: (method, path pattern, bucket, requests allowed per window, window seconds).
RULES = [
    ("POST", re.compile(r"/auth/(login|signup|password)$"), "auth", 10, 60),
    ("POST", re.compile(r"/auth/guest$"), "guest", 10, 60),
    ("POST", re.compile(r"/(runs|demo|demo/live|quickstart/create|strategy|refresh|locations)$"), "heavy", 20, 60),
    ("POST", re.compile(r"/(assistant/\w+|ask|explain|try-price)$"), "paid", 30, 60),
    ("POST", re.compile(r"/field/[^/]+/(records|submit)$"), "field", 60, 60),
]
# these two call public map services for anyone, signed in or not
PUBLIC_MAP = [("GET", re.compile(r"/market/(peek|preview)$"), "public_map", 30, 60), ("GET", re.compile(r"/market/suggest$"), "suggest", 120, 60)]
RULES += PUBLIC_MAP
WRITE = ("write", 120, 60)
READ = ("read", 600, 60)
MAX_TRACKED = 100_000

# shortcut: counters live in one process, so N API instances allow N times the limit; move to Postgres or Redis when scaling out.
_hits: dict[tuple[str, str], tuple[int, int]] = {}


def rule_for(method: str, path: str) -> tuple[str, int, int]:
    for m, pattern, bucket, limit, window in RULES:
        if m == method and pattern.search(path):
            return bucket, limit, window
    return READ if method in ("GET", "HEAD", "OPTIONS") else WRITE


def retry_after(client: str, bucket: str, limit: int, window: int, now: float | None = None) -> int:
    """Count one request. Returns 0 if allowed, else the seconds until the client's window resets."""
    now = time.time() if now is None else now
    slot = int(now // window)
    if len(_hits) >= MAX_TRACKED:
        _hits.clear()  # memory bound under an address-rotating flood; counts restart from here
    key = (client, bucket)
    seen_slot, count = _hits.get(key, (slot, 0))
    count = count + 1 if seen_slot == slot else 1
    _hits[key] = (slot, count)
    return 0 if count <= limit else int((slot + 1) * window - now) + 1


def client_ip(request: Request) -> str:
    """Only our own Next.js proxy may name the client; anyone else could forge the header to dodge limits."""
    secret = get_settings().proxy_secret
    sent = request.headers.get("x-siq-proxy", "")
    if secret and hmac.compare_digest(sent.encode(), secret.encode()):
        forwarded = request.headers.get("x-client-ip")
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"
