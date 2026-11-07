import asyncio

import numpy as np
import pytest

from app.categories.archetypes import ARCHETYPES
from app.engine.economics import behaviour as eb
from app.engine.economics import income_us as iu
from app.providers import census
from app.providers.http import ProviderError

# Household counts per bracket: poor, rich, and a national mix. Synthetic, shaped like ACS B19001.
POOR = [300, 200, 150, 120, 100, 80, 70, 60, 50, 40, 30, 15, 8, 4, 2, 1]
RICH = [5, 5, 5, 5, 10, 10, 15, 15, 20, 40, 80, 180, 220, 200, 240, 300]
NATION = [60, 40, 40, 40, 40, 40, 40, 40, 40, 70, 100, 130, 100, 70, 80, 90]
DATA = {"year": 2023, "national": {"counts": NATION, "hh_size": 2.5, "pop": 1000},
        "tracts": [{"id": "p", "lat": 30.0, "lng": -97.0, "counts": POOR, "hh_size": 3.0, "pop": 4000},
                   {"id": "r", "lat": 30.1, "lng": -97.0, "counts": RICH, "hh_size": 2.2, "pop": 4000}]}


def test_curve_reproduces_published_brackets_on_a_monthly_per_person_scale():
    c = iu.BracketCurve(NATION, 2.5)
    cum = np.cumsum(NATION) / np.sum(NATION)
    for i, edge in enumerate(iu.EDGES[1:]):
        assert c.cdf(edge / 12 / 2.5) == pytest.approx(cum[i], abs=1e-6)
    assert c.ppf(cum[9]) == pytest.approx(60000 / 12 / 2.5, rel=1e-4)  # $60k household of 2.5 = $2,000 a month each


def test_empty_brackets_still_give_a_monotonic_inverse():
    c = iu.BracketCurve([100] + [0] * 14 + [100], 2.0)
    x = c.ppf(np.linspace(0, 1, 50))
    assert (np.diff(x) >= 0).all() and x[0] == 0


def test_zones_take_their_nearest_tract_and_draws_follow_it():
    ctx = iu.build_context([30.001, 30.099], [-97.0, -97.0], DATA, state="Texas")
    assert ctx.method == "us_tract" and ctx.provenance[0]["source"] == "us_census"
    rng = np.random.default_rng(1)
    zi = np.repeat([0, 1], 20000)
    x, u = ctx.draw(rng, zi)
    assert np.median(x[zi == 0]) == pytest.approx(iu.BracketCurve(POOR, 3.0).median, rel=0.03)
    assert np.median(x[zi == 1]) == pytest.approx(iu.BracketCurve(RICH, 2.2).median, rel=0.03)
    assert ((u >= 0) & (u <= 1)).all()
    assert np.median(u[zi == 1]) > np.median(u[zi == 0]) + 0.3


def test_rich_and_poor_neighbourhoods_get_different_segments_and_wtp():
    arch = ARCHETYPES["membership"]
    poor = eb.build(arch, "gym", iu.build_context([30.0], [-97.0], DATA, state="Texas"), 1, seed=1)
    rich = eb.build(arch, "gym", iu.build_context([30.1], [-97.0], DATA, state="Texas"), 1, seed=1)
    premium = [i for i, s in enumerate(poor.segments) if s.key == "premium"][0]
    assert rich.zone_shares[0, premium] > poor.zone_shares[0, premium] + 0.3
    assert rich.summary["participation_lift"] > poor.summary["participation_lift"]
    assert sum(s.share for s in rich.segments) == pytest.approx(1.0)
    # India's published rates and labels must not leak into a US catchment.
    assert "participation" not in rich.params
    assert "India" not in " ".join(c["label"] for c in rich.summary["classes"])
    assert rich.summary["histogram"][-1]["hi"] is None and sum(h["share"] for h in rich.summary["histogram"]) == pytest.approx(1.0, abs=0.01)
    assert rich.summary["elasticity"]["status"] == "assumption"


def test_no_tracts_means_no_income_layer():
    assert iu.build_context([30.0], [-97.0], {"tracts": []}, state=None) is None


def _row(counts, hh="2.5", pop="1000"):
    return dict(zip(census.VARIABLES, [str(c) for c in counts] + [hh, pop]))


def test_suppressed_or_near_empty_tracts_are_dropped():
    h = census.VARIABLES
    assert census.parse_row(h, list(_row(POOR).values()))["hh_size"] == 2.5
    assert census.parse_row(h, list(_row(POOR, hh="-666666666").values())) is None
    assert census.parse_row(h, list(_row([-666666666] + POOR[1:]).values())) is None
    assert census.parse_row(h, list(_row([1] * 16).values())) is None


def test_us_income_joins_tracts_to_acs_rows(monkeypatch):
    monkeypatch.setenv("CENSUS_API_KEY", "k")
    from app.config import get_settings
    get_settings.cache_clear()

    async def fake(url, params):
        if url == census.TIGER_URL:
            attrs = [{"GEOID": "48453001100", "STATE": "48", "COUNTY": "453", "TRACT": "001100", "CENTLAT": "+30.27", "CENTLON": "-097.74"},
                     {"GEOID": "48453009999", "STATE": "48", "COUNTY": "453", "TRACT": "009999", "CENTLAT": "+30.30", "CENTLON": "-097.70"}]
            return {"features": [{"attributes": a} for a in attrs]}
        if params["for"] == "us:1":
            return [[*census.VARIABLES, "us"], [*_row(NATION).values(), "1"]]
        return [[*census.VARIABLES, "state", "county", "tract"], [*_row(RICH).values(), "48", "453", "001100"],
                [*_row(POOR, hh="-666666666").values(), "48", "453", "009999"]]

    monkeypatch.setattr(census, "_get_json", fake)
    try:
        data, prov = asyncio.run(census.us_income(30.27, -97.74, 2.0))
    finally:
        get_settings.cache_clear()
    assert [t["id"] for t in data["tracts"]] == ["48453001100"]
    assert data["tracts"][0]["lat"] == 30.27 and data["tracts"][0]["lng"] == -97.74
    assert data["national"]["counts"] == [float(c) for c in NATION]
    assert "tracts" in prov["detail"]


def test_missing_key_fails_clearly(monkeypatch):
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        with pytest.raises(ProviderError, match="CENSUS_API_KEY"):
            asyncio.run(census.us_income(30.27, -97.74, 2.0))
    finally:
        get_settings.cache_clear()
