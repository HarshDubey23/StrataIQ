from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import ai
from ..categories.archetypes import ARCHETYPES
from ..categories.resolver import from_taxonomy_key, merge_llm_proposal, resolve_offline
from ..categories.taxonomy import TAXONOMY
from ..db import session_factory
from ..engine.model import MODEL_VERSION
from ..models import User
from ..providers import osm
from ..providers.http import Cache, ProviderError
from ..providers.registry import SOURCES
from ..schemas import CategoryIn
from ..security import current_user

from ..config import get_settings  # noqa: E402

router = APIRouter(tags=["catalog"])


@router.get("/categories/archetypes")
def archetypes():
    return [a.to_public() for a in ARCHETYPES.values()]


@router.get("/categories/catalog")
def catalog():
    return [{"key": e.key, "label": e.label, "archetype": e.archetype, "synonyms": list(e.synonyms)} for e in TAXONOMY]


@router.post("/categories/resolve")
async def resolve(body: CategoryIn, user: User = Depends(current_user)):
    try:
        res = resolve_offline(body.query)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    if res.method == "keyword" and body.use_ai and ai.enabled():
        proposal = await ai.propose_category(body.query)
        if proposal:
            res = merge_llm_proposal(res, proposal)
    out = res.as_dict()
    out["archetype_detail"] = ARCHETYPES[res.archetype].to_public()
    out["ai_available"] = ai.enabled()
    return out


@router.get("/categories/by-key/{key}")
def by_key(key: str, user: User = Depends(current_user)):
    try:
        res = from_taxonomy_key(key)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    out = res.as_dict()
    out["archetype_detail"] = ARCHETYPES[res.archetype].to_public()
    return out


@router.get("/market/search")
async def search(q: str = Query(min_length=2, max_length=200), country: str | None = Query(default=None, max_length=20),
                 user: User = Depends(current_user)):
    try:
        results, prov = await osm.geocode(q, cache=Cache(session_factory()), country_codes=country or get_settings().search_countries)
    except ProviderError as e:
        raise HTTPException(502, f"Place search is unavailable right now ({e.message[:120]}). You can still drop a pin on the map.") from e
    return {"results": results, "source": prov}


@router.get("/market/reverse")
async def reverse(lat: float = Query(ge=-85, le=85), lng: float = Query(ge=-180, le=180), user: User = Depends(current_user)):
    name = await osm.reverse(lat, lng, cache=Cache(session_factory()))
    return {"display_name": name}


@router.get("/sources")
def sources():
    return SOURCES


@router.get("/system/capabilities")
def capabilities():
    from ..config import get_settings
    s = get_settings()
    return {"ai": ai.enabled(), "routing": bool(s.ors_api_key), "population": "worldpop", "places": "openstreetmap",
            "model_version": MODEL_VERSION}


# Public, cached preview for the landing page: real competitors around a famous street, no account needed.
PREVIEW_SPOTS = {
    "austin": {"label": "Downtown Austin, Texas", "lat": 30.2672, "lng": -97.7431},
    "miami": {"label": "Wynwood, Miami, Florida", "lat": 25.8005, "lng": -80.1990},
    "phoenix": {"label": "Downtown Phoenix, Arizona", "lat": 33.4484, "lng": -112.0740},
    "cp-delhi": {"label": "Connaught Place, New Delhi", "lat": 28.6315, "lng": 77.2167},
    "indiranagar": {"label": "Indiranagar, Bengaluru", "lat": 12.9719, "lng": 77.6412},
    "bandra": {"label": "Bandra West, Mumbai", "lat": 19.0596, "lng": 72.8295},
    "koramangala": {"label": "Koramangala, Bengaluru", "lat": 12.9352, "lng": 77.6245},
}
PREVIEW_CATS = {"gym", "cafe", "pizza", "restaurant", "pharmacy", "salon", "bakery_cafe", "grocery", "clothing"}


@router.get("/market/preview")
async def preview(spot: str = Query(default="austin"), category: str = Query(default="cafe"), radius_m: int = Query(default=1600, ge=300, le=3000),
                  lat: float | None = Query(default=None, ge=-85, le=85), lng: float | None = Query(default=None, ge=-180, le=180)):
    custom = lat is not None and lng is not None
    if (not custom and spot not in PREVIEW_SPOTS) or category not in PREVIEW_CATS:
        raise HTTPException(404, "Unknown preview")
    sp = {"label": "", "lat": lat, "lng": lng} if custom else PREVIEW_SPOTS[spot]
    entry = next((e for e in TAXONOMY if e.key == category), None)
    if entry is None:
        raise HTTPException(404, "Unknown category")
    try:
        pois, prov, complete = await osm.quick_competitors(sp["lat"], sp["lng"], radius_m, list(entry.filters), Cache(session_factory()),
                                                           terms=[entry.label.split("/")[0].strip(), *entry.synonyms[:2]])
    except ProviderError as e:
        raise HTTPException(502, f"OpenStreetMap is busy right now ({e.message[:100]})") from e
    return {"spot": {**sp, "key": spot}, "category": {"key": entry.key, "label": entry.label}, "radius_m": radius_m, "complete": complete,
            "competitors": [{"name": p["name"] or "Unnamed", "lat": p["lat"], "lng": p["lng"], "ref": p["ref"]} for p in pois],
            "source": {"name": " + ".join([prov.get("name") or ""] + [a["name"] for a in prov.get("also") or []]),
                       "retrieved_at": prov.get("retrieved_at"), "detail": prov.get("detail"), "from_cache": prov.get("from_cache"),
                       "attribution": " · ".join([prov.get("attribution") or ""] + [a["attribution"] for a in prov.get("also") or []])}}


@router.get("/market/suggest")
async def suggest(q: str = Query(min_length=3, max_length=120)):
    """Public address suggestions while someone types. A slow or failed lookup just shows none: typing still works."""
    try:
        return {"results": await osm.suggest_places(q, Cache(session_factory()))}
    except Exception:  # noqa: BLE001
        return {"results": []}


@router.get("/market/peek")
async def peek(category: str = Query(default="gym"), q: str | None = Query(default=None, min_length=3, max_length=200),
               lat: float | None = Query(default=None, ge=-85, le=85), lng: float | None = Query(default=None, ge=-180, le=180), label: str | None = Query(default=None, max_length=200)):
    """Public first look at a US address: real Census figures around it, and the costs a founder would start from."""
    from ..api.quickstart import ARCH_COSTS, ARCH_PRICE, TYPICAL_PRICE
    from ..engine.economics import income_us

    entry = next((e for e in TAXONOMY if e.key == category), None)
    if entry is None or category not in PREVIEW_CATS:
        raise HTTPException(404, "Unknown category")
    if lat is None or lng is None:
        if not q:
            raise HTTPException(422, "Enter an address")
        try:
            found, _ = await osm.geocode(q, limit=1, cache=Cache(session_factory()), country_codes="us")
        except ProviderError as e:
            raise HTTPException(502, f"Address search is busy right now ({e.message[:100]})") from e
        if not found:
            # say what is actually wrong: a real place outside our data is not a bad address
            try:
                anywhere, _ = await osm.geocode(q, limit=1, cache=Cache(session_factory()))
            except ProviderError:
                anywhere = []
            if anywhere:
                raise HTTPException(422, f"{anywhere[0]['name']} is outside the United States. StrataIQ only has US data for now, so try a US address.")
            raise HTTPException(404, "We could not find that address. Try a street, city and state, like 1402 South Lamar, Austin, TX.")
        lat, lng, label = found[0]["lat"], found[0]["lng"], found[0]["display_name"]
    data = income_us.load_tracts()
    area = income_us.area_summary(data, lat, lng) if data is not None else None
    if area is None:
        raise HTTPException(422, "We only have Census data for US addresses right now.")
    arch = ARCHETYPES[entry.archetype]
    return {
        "place": {"label": label or q or "", "lat": lat, "lng": lng},
        "category": {"key": entry.key, "label": entry.label},
        "area": {**area, "radius_miles": 2, "source": "U.S. Census ACS 2023 5-year and LODES jobs"},
        "typical": {"price": float(TYPICAL_PRICE.get(entry.key, ARCH_PRICE[entry.archetype])), "unit": arch.unit_label, "per_day": entry.archetype != "membership",
                    "variable_cost_ratio": arch.params["variable_cost_ratio"].value, **ARCH_COSTS[entry.archetype]},
    }


@router.get("/market/sources-check")
async def sources_check():
    """Public diagnostic: is the optional Foursquare source configured and answering? (Never returns the key.)"""
    from ..providers import foursquare
    if not foursquare.enabled():
        return {"foursquare": {"enabled": False}}
    pois = await foursquare.fsq_pois(28.6315, 77.2167, 1200, ["pizza"])
    return {"foursquare": {"enabled": True, "results_near_cp_delhi_pizza": len(pois), "api": foursquare.STATUS["api"],
                           "last_http": foursquare.STATUS["last_http"], "last_error": foursquare.STATUS["last_error"],
                           "sample": [p["name"] for p in pois[:8]]}}
