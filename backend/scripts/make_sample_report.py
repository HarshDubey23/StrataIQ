"""Save a real report for the public sample page: live market data, example business inputs, the full engine.

Run inside the API container: python scripts/make_sample_report.py
It replaces the previous sample. Nothing here is hand-written; only the business inputs are examples.
"""
from __future__ import annotations

import asyncio
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.decisions import _report_content  # noqa: E402
from app.api.demo import LIVE_KINDS  # noqa: E402
from app.categories.resolver import from_taxonomy_key  # noqa: E402
from app.db import session_factory  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.models import CandidateLocation, Project, Report, Scenario, User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services.runs import execute_run, point_wkt, refresh_snapshot  # noqa: E402


TOKEN = "sample-austin"
EMAIL = "sample-report@internal.strataiq.app"


async def main() -> None:
    with session_factory()() as db:
        old = db.scalar(select(User).where(User.email == EMAIL))
        if old:
            db.delete(old)  # cascades to the old project and report
            db.commit()
        user = User(email=EMAIL, name="Sample report", password_hash=hash_password(secrets.token_urlsafe(24)), preferences={"internal": True})
        db.add(user)
        db.flush()
        k = LIVE_KINDS["cafe"]
        p = Project(owner_id=user.id, name="Specialty café, Downtown Austin", objective="start_new", decision_goal="profit", category=from_taxonomy_key(k["key"], k["key"]).as_dict(),
                    profile={"description": "A sample report. Market data is live; the business inputs are examples.", "positioning": k["positioning"], "operating_hours": k["hours"]},
                    status="created", is_demo=False)
        db.add(p)
        db.flush()
        lat, lng = 30.2672, -97.7431
        loc = CandidateLocation(project_id=p.id, label="Downtown Austin", address="Downtown Austin, Texas", lat=lat, lng=lng, geog=point_wkt(lat, lng),
                                catchment={"mode": "radius", "radius_km": k["radius_km"], "minutes": None, "profile": "foot-walking"})
        db.add(loc)
        db.flush()
        db.add(Scenario(project_id=p.id, location_id=loc.id, name="Plan: $9 average order", is_baseline=True, inputs=dict(k["base"])))
        db.add(Scenario(project_id=p.id, location_id=loc.id, name="Lower price: $7", inputs=k["base"] | {"price": 7}))
        db.add(Scenario(project_id=p.id, location_id=loc.id, name="Higher price: $11", inputs=k["base"] | {"price": 11}))
        db.commit()
        db.refresh(p)
        await refresh_snapshot(db, p, loc)
        db.refresh(p)
        for scenario in list(p.scenarios):
            execute_run(db, p, scenario)
        db.refresh(p)
        db.add(Report(project_id=p.id, content=_report_content(db, p), share_token=TOKEN))
        db.commit()
        print(f"saved sample report {TOKEN}")


if __name__ == "__main__":
    asyncio.run(main())
