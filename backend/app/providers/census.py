"""US neighbourhood income: Census ACS 5-year household income by tract, located with TIGERweb tract centroids."""
from __future__ import annotations

import asyncio
import math
from datetime import timedelta

import httpx

from ..config import get_settings
from .http import Cache, ProviderError, cache_key, client
from .registry import provenance

ACS_YEAR = 2023
ACS_URL = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5"
TIGER_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query"
BRACKETS = [f"B19001_{i:03d}E" for i in range(2, 18)]  # 16 household income brackets, <$10k to $200k+
HH_SIZE, POPULATION = "B25010_001E", "B01003_001E"
VARIABLES = [*BRACKETS, HH_SIZE, POPULATION]
TTL = timedelta(days=60)
MIN_HOUSEHOLDS = 30  # ACS estimates for near-empty tracts are too noisy to describe a neighbourhood


def parse_row(header: list[str], row: list[str]) -> dict | None:
    """One ACS row to our shape, or None when the Census has suppressed the estimate (negative sentinel values)."""
    v = dict(zip(header, row))
    try:
        counts = [float(v[b]) for b in BRACKETS]
        hh_size = float(v[HH_SIZE])
    except (KeyError, TypeError, ValueError):
        return None
    if min(counts) < 0 or hh_size <= 0 or sum(counts) < MIN_HOUSEHOLDS:
        return None
    return {"counts": counts, "hh_size": hh_size, "pop": max(float(v.get(POPULATION) or 0), 0.0)}


async def _get_json(url: str, params: dict):
    try:
        r = await client().get(url, params=params, timeout=httpx.Timeout(40.0, connect=10.0), follow_redirects=False)
    except httpx.HTTPError as e:  # the exception text can contain the URL and so the API key: keep only its type
        raise ProviderError("census", f"request failed ({type(e).__name__})") from None
    if r.status_code in (301, 302) and "key" in r.headers.get("location", ""):
        raise ProviderError("census", "the Census API rejected the key; check CENSUS_API_KEY and that it was activated")
    if r.status_code != 200:
        raise ProviderError("census", f"HTTP {r.status_code}")
    try:
        return r.json()
    except ValueError:
        raise ProviderError("census", "unparseable response") from None


async def _acs(geo: dict, cache: Cache | None) -> list[dict]:
    key = cache_key(f"census:acs{ACS_YEAR}", geo)
    if cache and (hit := cache.get(key)):
        return hit[0]["rows"]
    body = await _get_json(ACS_URL, {"get": ",".join(VARIABLES), **geo, "key": get_settings().census_api_key})
    header, *rows = body
    out = [dict(zip(header, r)) for r in rows]
    if cache:
        cache.put(key, "census", {"rows": out}, TTL)
    return out


async def _tracts_in_box(lat: float, lng: float, radius_km: float, cache: Cache | None) -> list[dict]:
    dlat = (radius_km + 1.0) / 111.0
    dlng = (radius_km + 1.0) / (111.0 * max(math.cos(math.radians(lat)), 0.2))
    box = f"{lng - dlng:.4f},{lat - dlat:.4f},{lng + dlng:.4f},{lat + dlat:.4f}"
    key = cache_key("census:tiger", {"box": box})
    if cache and (hit := cache.get(key)):
        return hit[0]["tracts"]
    body = await _get_json(TIGER_URL, {"geometry": box, "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                                       "spatialRel": "esriSpatialRelIntersects", "outFields": "GEOID,STATE,COUNTY,TRACT,CENTLAT,CENTLON",
                                       "returnGeometry": "false", "f": "json"})
    if "features" not in body:
        raise ProviderError("census", "TIGERweb returned no tract list")
    out = [{"id": a["GEOID"], "state": a["STATE"], "county": a["COUNTY"], "tract": a["TRACT"],
            "lat": float(a["CENTLAT"]), "lng": float(a["CENTLON"])} for a in (f["attributes"] for f in body["features"])]
    if cache:
        cache.put(key, "census", {"tracts": out}, TTL)
    return out


async def us_income(lat: float, lng: float, radius_km: float, cache: Cache | None = None) -> tuple[dict, dict]:
    """Income brackets for every tract around a point, plus the national brackets to compare against."""
    if not get_settings().census_api_key:
        raise ProviderError("census", "CENSUS_API_KEY is not set")
    tracts = await _tracts_in_box(lat, lng, radius_km, cache)
    if not tracts:
        raise ProviderError("census", "no US census tracts at this location")
    counties = sorted({(t["state"], t["county"]) for t in tracts})
    national, *by_county = await asyncio.gather(
        _acs({"for": "us:1"}, cache),
        *[_acs({"for": "tract:*", "in": f"state:{s} county:{c}"}, cache) for s, c in counties])
    rows = {r["state"] + r["county"] + r["tract"]: r for county in by_county for r in county}
    header = [*VARIABLES]
    nat = parse_row(header, [national[0].get(k) for k in header])
    if nat is None:
        raise ProviderError("census", "national income figures are unavailable")
    out = []
    for t in tracts:
        r = rows.get(t["id"])
        parsed = parse_row(header, [r.get(k) for k in header]) if r else None
        if parsed:
            out.append({"id": t["id"], "lat": t["lat"], "lng": t["lng"], **parsed})
    if not out:
        raise ProviderError("census", "no usable income estimates for these tracts")
    return {"year": ACS_YEAR, "national": nat, "tracts": out}, provenance(
        "us_census", detail=f"Household income for {len(out)} census tracts, ACS {ACS_YEAR} 5-year estimates")
