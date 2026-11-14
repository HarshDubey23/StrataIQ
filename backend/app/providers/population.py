"""Population (WorldPop) and travel-time catchments (openrouteservice)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from ..config import get_settings
from .http import Cache, ProviderError, cache_key, client
from .registry import provenance


def _round_ring(ring: list[list[float]]) -> list[list[float]]:
    return [[round(x, 5), round(y, 5)] for x, y in ring]


async def _worldpop(endpoint: str, polygon: list[list[list[float]]], cache: Cache | None, ttl_days: int = 60) -> tuple[dict, object, bool]:
    """One WorldPop v3 request (`population` or `agesex`) for a polygon and the configured year. v1 was retired in 2026."""
    s = get_settings()
    body = {"year": s.worldpop_year, "geojson": {"type": "Polygon", "coordinates": [_round_ring(r) for r in polygon]}}
    key = cache_key(f"worldpop3:{endpoint}", body)
    if cache and (hit := cache.get(key)):
        return hit[0], hit[1], True
    headers = {"X-API-Key": s.worldpop_api_key} if s.worldpop_api_key else None  # optional: raises the anonymous daily limit
    try:
        for attempt in range(2):
            try:
                r = await client().post(f"{s.worldpop_url}/{endpoint}", json=body, headers=headers, timeout=httpx.Timeout(40.0, connect=15.0))
                break
            except httpx.TimeoutException:
                if attempt == 1:
                    raise
                await asyncio.sleep(2)
        if r.status_code >= 400:
            raise ProviderError("worldpop", f"{endpoint} query failed: HTTP {r.status_code} {r.text[:160]}")
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ProviderError("worldpop", f"{endpoint} query failed: {type(e).__name__} {e}".strip()) from e
    if cache:
        cache.put(key, f"worldpop:{endpoint}", data, timedelta(days=ttl_days))
    return data, datetime.now(timezone.utc), False


async def worldpop_total(polygon: list[list[list[float]]], cache: Cache | None = None) -> tuple[float, dict]:
    """Total modelled population inside a GeoJSON polygon (WorldPop, fixed reference year)."""
    s = get_settings()
    data, fetched, cached = await _worldpop("population", polygon, cache)
    try:
        total = float(data["total_population"])
    except (KeyError, TypeError, ValueError) as e:
        raise ProviderError("worldpop", f"unexpected population payload: {str(data)[:120]}") from e
    return total, provenance("worldpop", retrieved_at=fetched, cached=cached, source_updated_at=f"{s.worldpop_year} reference year",
                             detail="Total population inside the catchment")


def parse_age_sex(data: dict) -> dict:
    """WorldPop v3 agesex -> 17 five-year bands (0-4 … 80+) with male/female counts."""
    rows = sorted(data.get("agesex_pyramid") or [], key=lambda x: int(x.get("class", 0)))
    if len(rows) != 20:
        raise ProviderError("worldpop", f"age-sex pyramid has {len(rows)} classes, expected 20")

    def band(label: str, part: list[dict]) -> dict:
        return {"age": label, "male": sum(float(r.get("male") or 0) for r in part), "female": sum(float(r.get("female") or 0) for r in part)}

    # WorldPop splits the first band into under 1 and 1-4, and the last into 80-84, 85-89 and 90+: merge both back.
    return {"bands": [band("0 to 4", rows[:2])] + [band(str(r.get("age")), [r]) for r in rows[2:17]] + [band("80 and over", rows[17:])]}


async def worldpop_age_sex(polygon: list[list[list[float]]], cache: Cache | None = None) -> tuple[dict, dict]:
    s = get_settings()
    data, fetched, cached = await _worldpop("agesex", polygon, cache)
    return parse_age_sex(data), provenance("worldpop", retrieved_at=fetched, cached=cached, source_updated_at=f"{s.worldpop_year} reference year",
                                           detail="Age and sex structure inside the catchment (17 five-year bands)")


async def ors_isochrone(lat: float, lng: float, minutes: int, profile: str = "foot-walking", cache: Cache | None = None) -> tuple[list[list[list[float]]], dict]:
    s = get_settings()
    if not s.ors_api_key:
        raise ProviderError("openrouteservice", "ORS_API_KEY not configured")
    if profile not in {"foot-walking", "driving-car", "cycling-regular"}:
        raise ProviderError("openrouteservice", f"unsupported profile {profile}")
    body = {"locations": [[round(lng, 6), round(lat, 6)]], "range": [int(minutes) * 60], "range_type": "time"}
    key = cache_key("ors_iso", {"p": profile, **body})
    if cache and (hit := cache.get(key)):
        return hit[0]["polygon"], provenance("openrouteservice", retrieved_at=hit[1], cached=True, detail=f"{minutes} min {profile}")
    try:
        r = await client().post(f"{s.ors_url}/v2/isochrones/{profile}", json=body,
                                headers={"Authorization": s.ors_api_key, "Content-Type": "application/json"})
        r.raise_for_status()
        geom = r.json()["features"][0]["geometry"]
        poly = geom["coordinates"] if geom["type"] == "Polygon" else max(geom["coordinates"], key=lambda p: len(p[0]))
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        raise ProviderError("openrouteservice", f"isochrone failed: {e}") from e
    if cache:
        cache.put(key, "ors_iso", {"polygon": poly}, timedelta(days=30))
    return poly, provenance("openrouteservice", detail=f"{minutes} min {profile} travel-time area")
