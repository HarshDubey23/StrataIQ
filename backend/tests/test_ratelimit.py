from types import SimpleNamespace

import pytest

from app import ratelimit as rl
from app.config import get_settings


@pytest.fixture(autouse=True)
def clean():
    rl._hits.clear()
    yield
    rl._hits.clear()


def test_limit_blocks_only_after_allowance_and_resets_with_window():
    assert [rl.retry_after("a", "auth", 2, 60, now=120.0) for _ in range(2)] == [0, 0]
    assert rl.retry_after("a", "auth", 2, 60, now=130.0) == 51  # blocked until the window ends at t=180
    assert rl.retry_after("a", "auth", 2, 60, now=180.0) == 0


def test_clients_and_buckets_are_counted_separately():
    assert rl.retry_after("a", "auth", 1, 60, now=0.0) == 0
    assert rl.retry_after("a", "auth", 1, 60, now=1.0) > 0
    assert rl.retry_after("b", "auth", 1, 60, now=1.0) == 0
    assert rl.retry_after("a", "guest", 1, 60, now=1.0) == 0


@pytest.mark.parametrize("method,path,bucket", [
    ("POST", "/api/v1/auth/login", "auth"),
    ("POST", "/api/v1/auth/guest", "guest"),
    ("POST", "/api/v1/auth/logout", "write"),
    ("POST", "/api/v1/scenarios/abc/runs", "heavy"),
    ("POST", "/api/v1/demo/live", "heavy"),
    ("POST", "/api/v1/projects/abc/assistant/ask", "paid"),
    ("POST", "/api/v1/assistant/tts", "paid"),
    ("POST", "/api/v1/field/tok/submit", "field"),
    ("GET", "/api/v1/projects/abc/runs", "read"),
    ("DELETE", "/api/v1/projects/abc", "write"),
])
def test_routes_land_in_the_intended_bucket(method, path, bucket):
    assert rl.rule_for(method, path)[0] == bucket


def _request(headers, host="9.9.9.9"):
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=host))


def test_forged_client_ip_is_ignored_without_the_proxy_secret(monkeypatch):
    monkeypatch.setenv("PROXY_SECRET", "s3cret")
    get_settings.cache_clear()
    try:
        assert rl.client_ip(_request({"x-client-ip": "1.1.1.1"})) == "9.9.9.9"
        assert rl.client_ip(_request({"x-client-ip": "1.1.1.1", "x-siq-proxy": "wrong"})) == "9.9.9.9"
        assert rl.client_ip(_request({"x-client-ip": "1.1.1.1", "x-siq-proxy": "s3cret"})) == "1.1.1.1"
    finally:
        get_settings.cache_clear()


def test_production_refuses_to_start_without_proxy_secret(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "a-real-secret")
    monkeypatch.delenv("PROXY_SECRET", raising=False)
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="PROXY_SECRET"):
            get_settings()
    finally:
        monkeypatch.delenv("APP_ENV")
        get_settings.cache_clear()
