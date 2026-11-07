from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _bool(v: str | None, default: bool = False) -> bool:
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def _list(v: str | None, default: list[str]) -> list[str]:
    if not v:
        return default
    return [x.strip() for x in v.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "postgresql+psycopg://strataiq:strataiq@localhost:5432/strataiq"))
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", "dev-insecure-change-me"))
    # Shared with the Next.js proxy, which alone may tell the API who the real client is (rate limits).
    proxy_secret: str = field(default_factory=lambda: os.getenv("PROXY_SECRET", ""))
    # One deployment sells in one market: it sets currency, starter costs, map search and demo places.
    market: str = field(default_factory=lambda: os.getenv("MARKET", "US").upper())
    jwt_ttl_hours: int = field(default_factory=lambda: int(os.getenv("JWT_TTL_HOURS", "168")))
    cookie_secure: bool = field(default_factory=lambda: _bool(os.getenv("COOKIE_SECURE"), False))
    cors_origins: list[str] = field(default_factory=lambda: _list(os.getenv("CORS_ORIGINS"), ["http://localhost:3000"]))
    contact_email: str = field(default_factory=lambda: os.getenv("CONTACT_EMAIL", ""))
    nominatim_url: str = field(default_factory=lambda: os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org"))
    overpass_urls: list[str] = field(default_factory=lambda: _list(os.getenv("OVERPASS_URLS"), [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ]))
    worldpop_url: str = field(default_factory=lambda: os.getenv("WORLDPOP_URL", "https://api.worldpop.org/v1"))
    worldpop_year: int = field(default_factory=lambda: int(os.getenv("WORLDPOP_YEAR", "2020")))
    fsq_api_key: str = field(default_factory=lambda: os.getenv("FSQ_API_KEY", ""))
    ors_api_key: str = field(default_factory=lambda: os.getenv("ORS_API_KEY", ""))
    ors_url: str = field(default_factory=lambda: os.getenv("ORS_URL", "https://api.openrouteservice.org"))
    routing_url: str = field(default_factory=lambda: os.getenv("ROUTING_URL", "https://routing.openstreetmap.de"))
    routing_max_coords: int = field(default_factory=lambda: int(os.getenv("ROUTING_MAX_COORDS", "100")))
    ai_api_key: str = field(default_factory=lambda: os.getenv("AI_API_KEY", ""))
    ai_api_url: str = field(default_factory=lambda: os.getenv("AI_API_URL", ""))
    ai_model: str = field(default_factory=lambda: os.getenv("AI_MODEL", ""))
    ai_extra_header: str = field(default_factory=lambda: os.getenv("AI_EXTRA_HEADER", ""))
    # Speko voice gateway: LLM brain + Hinglish TTS for the voice analyst
    speko_api_key: str = field(default_factory=lambda: os.getenv("SPEKO_API_KEY", ""))
    speko_url: str = field(default_factory=lambda: os.getenv("SPEKO_URL", "https://api.speko.dev"))
    speko_voice: str = field(default_factory=lambda: os.getenv("SPEKO_VOICE", "cb9c954d-bcaa-43ed-82bf-aeb5e88a3cb5"))  # Cartesia Hindi male
    http_timeout_s: float = field(default_factory=lambda: float(os.getenv("HTTP_TIMEOUT_S", "40")))
    persons_per_building: float = field(default_factory=lambda: float(os.getenv("PERSONS_PER_BUILDING", "12")))
    abm_agents: int = field(default_factory=lambda: int(os.getenv("ABM_AGENTS", "10000")))
    mc_draws: int = field(default_factory=lambda: int(os.getenv("MC_DRAWS", "800")))
    # Serverless hosts (Vercel) cannot run work after the response: refresh market data inside the request.
    serverless: bool = field(default_factory=lambda: _bool(os.getenv("SERVERLESS"), bool(os.getenv("VERCEL"))))
    auto_migrate: bool = field(default_factory=lambda: _bool(os.getenv("AUTO_MIGRATE"), False))

    @property
    def currency(self) -> str:
        return "$" if self.market == "US" else "₹"

    @property
    def search_countries(self) -> str | None:
        return "us" if self.market == "US" else None

    @property
    def user_agent(self) -> str:
        contact = f" ({self.contact_email})" if self.contact_email else ""
        return f"StrataIQ/1.0 market-simulation{contact}"

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        # Hosted providers hand out postgres:// or postgresql:// URLs; use the psycopg 3 driver.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.app_env == "production" and s.jwt_secret.startswith("dev-"):
        raise RuntimeError("JWT_SECRET must be set in production")
    if s.app_env == "production" and not s.proxy_secret:
        raise RuntimeError("PROXY_SECRET must be set in production, or all visitors share one rate limit")
    return s
