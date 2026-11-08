"""A real Indian example from the full engine: a café in Civil Lines, Prayagraj.

Run inside an API container started with MARKET=IN:  python scripts/make_india_example.py [out.json]
It builds a project for an internal user, loads the live market (OpenStreetMap + Foursquare rivals, WorldPop people,
HCES 2023-24 spending), runs the simulation, and writes what a story needs: the real rivals, the result in rupees, and
a few synthetic people with where they live, who they chose and why. Only the business inputs are examples; they come
from public listings and are written next to each number.
"""
from __future__ import annotations

import asyncio
import json
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
import numpy as np  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.api.decisions import _report_content  # noqa: E402
from app.api.genome import _final, _load  # noqa: E402
from app.categories.resolver import from_taxonomy_key  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import session_factory  # noqa: E402
from app.engine import genome as gm  # noqa: E402
from app.engine.geo import haversine_km  # noqa: E402
from app.models import CandidateLocation, Competitor, MarketSnapshot, Project, Report, Scenario, User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services.runs import execute_run, latest_runs, point_wkt, refresh_snapshot  # noqa: E402

TOKEN = "sample-report-civil-lines-prayagraj"
EMAIL = "india-example@internal.strataiq.app"
LAT, LNG = 25.4528, 81.8340  # Civil Lines, Prayagraj, near Subhash Chauraha

# Example inputs for a 32-seat café, each from a public source (checked Nov 2026):
BASE = {
    "price": 300,  # per person; Civil Lines cafés list ₹500-700 for two (EazyDiner: Cannington, Cafe Meraki, Baithak, Coffeecana)
    "rent": 72000,  # ~800 sq ft at ~₹90/sq ft/month; Civil Lines listings ask ₹43-134/sq ft (Housing.com, RealEstateIndia)
    "payroll": 94000,  # 4 staff at ~₹13,000 (UP minimum wage, semi-skilled, Oct 2025: ₹12,123) + cook ₹20,000 + manager ₹22,000
    "utilities": 25000, "other_fixed": 15000, "marketing_spend": 20000,
    "startup_cost": 1800000,  # interiors, kitchen, furniture, 3 months' rent deposit
    "quality": 0.65, "reference_price": None, "variable_cost_per_unit": None,
    "capacity": {"seats": 32, "turns_per_day": 4, "open_days_per_month": 30}, "param_overrides": {}, "seed": 42,
}


def place_name(lat: float, lng: float) -> str:
    """Neighbourhood and road of a synthetic person's home point (OpenStreetMap Nominatim, 1 request a second)."""
    s = get_settings()
    try:
        r = httpx.get("https://nominatim.openstreetmap.org/reverse", params={"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 17, "addressdetails": 1},
                      headers={"User-Agent": s.user_agent, "Accept-Language": "en"}, timeout=20)
        a = r.json().get("address", {})
        time.sleep(1.1)
        parts = [a.get("road"), a.get("neighbourhood") or a.get("suburb") or a.get("quarter") or a.get("city_district")]
        return ", ".join(p for p in parts if p) or a.get("city") or "Prayagraj"
    except (httpx.HTTPError, ValueError):
        return "Prayagraj"


async def main(out_path: str) -> None:
    assert get_settings().market == "IN", "run with MARKET=IN"
    with session_factory()() as db:
        old = db.scalar(select(User).where(User.email == EMAIL))
        if old:
            db.delete(old)
            db.commit()
        user = User(email=EMAIL, name="India example", password_hash=hash_password(secrets.token_urlsafe(24)), preferences={"internal": True})
        db.add(user)
        db.flush()
        p = Project(owner_id=user.id, name="Café, Civil Lines, Prayagraj", objective="start_new", decision_goal="profit",
                    category=from_taxonomy_key("cafe", "cafe"),
                    profile={"description": "An example. Market data is live; the business inputs are from public listings.",
                             "positioning": ["Premium experience", "Better service"], "operating_hours": "8am–11pm"},
                    status="created", is_demo=False)
        db.add(p)
        db.flush()
        loc = CandidateLocation(project_id=p.id, label="Civil Lines", address="Civil Lines, Prayagraj, Uttar Pradesh", lat=LAT, lng=LNG,
                                geog=point_wkt(LAT, LNG), catchment={"mode": "radius", "radius_km": 1.5, "minutes": None, "profile": "foot-walking"})
        db.add(loc)
        db.flush()
        db.add(Scenario(project_id=p.id, location_id=loc.id, name="Plan: ₹300 a person", is_baseline=True, inputs=dict(BASE)))
        db.add(Scenario(project_id=p.id, location_id=loc.id, name="Smaller shop: ₹45,000 rent", inputs=BASE | {"rent": 45000, "capacity": {"seats": 20, "turns_per_day": 4, "open_days_per_month": 30}}))
        db.add(Scenario(project_id=p.id, location_id=loc.id, name="Lower price: ₹250", inputs=BASE | {"price": 250}))
        db.commit()
        db.refresh(p)
        await refresh_snapshot(db, p, loc)
        db.refresh(p)
        for scenario in list(p.scenarios):
            execute_run(db, p, scenario)
        db.refresh(p)
        db.add(Report(project_id=p.id, content=_report_content(db, p), share_token=TOKEN))
        db.commit()
        runs = latest_runs(db, p)
        base = next(s for s in p.scenarios if s.is_baseline)
        run = runs[base.id]
        snap = db.scalar(select(MarketSnapshot).where(MarketSnapshot.location_id == loc.id).order_by(MarketSnapshot.retrieved_at.desc()))
        comps = db.scalars(select(Competitor).where(Competitor.project_id == p.id, Competitor.active.is_(True))).all()
        out = {"project_id": p.id, "run_id": run.id, "report_token": TOKEN, "inputs": BASE,
               "scenarios": {s.name: (runs[s.id].results or {}).get("summary") for s in p.scenarios if s.id in runs},
               "results_keys": list((run.results or {}).keys())}
        out["competitors"] = sorted(({"name": c.name, "source": c.source, "lat": c.lat, "lng": c.lng, "dist_km": round(haversine_km(LAT, LNG, c.lat, c.lng), 2),
                                      "kind": (c.tags or {}).get("amenity") or (c.tags or {}).get("shop") or (c.tags or {}).get("category")} for c in comps),
                                    key=lambda c: c["dist_km"])
        if snap is not None:
            out["population"] = {k: v for k, v in (snap.population or {}).items() if k not in ("routing", "zones", "age_sex")}
            out["sources"] = snap.sources
            out["errors"] = snap.errors

    # synthetic people: who they are, where they live, what they chose and why
    pop, abm, pct, _, _ = _load(run.id)
    final = _final(abm)
    cols = abm["agents"]["columns"]
    rows = abm["agents"]["rows"]
    rng = np.random.default_rng(7)
    picks = list(rng.choice(np.where(final == 0)[0], 3, replace=False)) if (final == 0).sum() >= 3 else list(np.where(final == 0)[0])
    for j in [j for j, _ in sorted(((j, int((final == j).sum())) for j in set(final.tolist()) if j > 0), key=lambda x: -x[1])[:4]]:
        picks.append(int(rng.choice(np.where(final == j)[0])))
    if (final < 0).any():
        picks.append(int(rng.choice(np.where(final < 0)[0])))
    people = []
    for i in picks:
        i = int(i)
        row = dict(zip(cols, rows[i]))
        x = gm.explain(i, pop.gen, pop.up, pop.names, int(final[i]), pct)
        people.append({
            "agent": i, "home": place_name(row["lat"], row["lng"]), "lat": row["lat"], "lng": row["lng"], "age": row["age"],
            "female": row["female"], "segment": abm["agents"]["segments"][row["segment"]], "mode": abm["agents"]["modes"][row["mode"]],
            "occupation": abm["agents"]["occupations"][row["occupation"]] if "occupation" in row else None,
            "wtp": row.get("wtp"), "chose": pop.names[int(final[i])] if final[i] >= 0 else None,
            "options": [{k: o[k] for k in ("name", "dist_km", "time_min", "utility", "parts")} for o in x["options"][:4]],
            "drivers": [{k: d[k] for k in ("label", "effect")} for d in x["drivers_vs_you"][:4]],
        })
    out["people"] = people
    out["agent_count"] = int(pop.N)
    out["names"] = pop.names[:30]
    Path(out_path).write_text(json.dumps(out, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print("saved", out_path, "people", len(people), "rivals", len(out.get("competitors", [])))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/india_example.json"))
