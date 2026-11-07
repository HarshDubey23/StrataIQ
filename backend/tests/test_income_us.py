import importlib.util
from pathlib import Path

import numpy as np
import pytest

from app.categories.archetypes import ARCHETYPES
from app.engine.economics import behaviour as eb
from app.engine.economics import income_us as iu

# Household counts per bracket: poor, rich, and a national mix. Synthetic, shaped like ACS B19001.
POOR = [300, 200, 150, 120, 100, 80, 70, 60, 50, 40, 30, 15, 8, 4, 2, 1]
RICH = [5, 5, 5, 5, 10, 10, 15, 15, 20, 40, 80, 180, 220, 200, 240, 300]
NATION = [60, 40, 40, 40, 40, 40, 40, 40, 40, 70, 100, 130, 100, 70, 80, 90]
DATA = {"lat": np.array([30.0, 30.1]), "lng": np.array([-97.0, -97.0]), "counts": np.array([POOR, RICH]), "hh_size": np.array([3.0, 2.2]),
        "nation_counts": np.array(NATION), "nation_hh_size": np.float32(2.5), "year": np.int32(2023)}

spec = importlib.util.spec_from_file_location("build_us_tracts", Path(__file__).parents[1] / "scripts" / "build_us_tracts.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def test_curve_reproduces_published_brackets_on_a_monthly_per_person_scale():
    c = iu.BracketCurve(NATION, 2.5)
    cum = np.cumsum(NATION) / np.sum(NATION)
    for i, edge in enumerate(iu.EDGES[1:]):
        assert c.cdf(edge / 12 / 2.5) == pytest.approx(cum[i], abs=1e-6)
    assert c.ppf(cum[9]) == pytest.approx(60000 / 12 / 2.5, rel=1e-4)  # $60k household of 2.5 = $2,000 a month each


def test_empty_brackets_still_give_a_monotonic_inverse():
    x = iu.BracketCurve([100] + [0] * 14 + [100], 2.0).ppf(np.linspace(0, 1, 50))
    assert (np.diff(x) >= 0).all() and x[0] == 0


def test_zones_take_their_nearest_tract_and_draws_follow_it():
    ctx = iu.build_context([30.001, 30.099], [-97.0, -97.0], state="Texas", data=DATA)
    assert ctx.method == "us_tract" and ctx.provenance[0]["source"] == "us_census"
    zi = np.repeat([0, 1], 20000)
    x, u = ctx.draw(np.random.default_rng(1), zi)
    assert np.median(x[zi == 0]) == pytest.approx(iu.BracketCurve(POOR, 3.0).median, rel=0.03)
    assert np.median(x[zi == 1]) == pytest.approx(iu.BracketCurve(RICH, 2.2).median, rel=0.03)
    assert ((u >= 0) & (u <= 1)).all()
    assert np.median(u[zi == 1]) > np.median(u[zi == 0]) + 0.3


def test_rich_and_poor_neighbourhoods_get_different_segments_and_wtp():
    arch = ARCHETYPES["membership"]
    poor = eb.build(arch, "gym", iu.build_context([30.0], [-97.0], state="Texas", data=DATA), 1, seed=1)
    rich = eb.build(arch, "gym", iu.build_context([30.1], [-97.0], state="Texas", data=DATA), 1, seed=1)
    premium = [i for i, s in enumerate(poor.segments) if s.key == "premium"][0]
    assert rich.zone_shares[0, premium] > poor.zone_shares[0, premium] + 0.3
    assert rich.summary["participation_lift"] > poor.summary["participation_lift"]
    assert sum(s.share for s in rich.segments) == pytest.approx(1.0)
    # India's published rates and labels must not leak into a US catchment.
    assert "participation" not in rich.params
    assert "India" not in " ".join(c["label"] for c in rich.summary["classes"])
    assert rich.summary["histogram"][-1]["hi"] is None and sum(h["share"] for h in rich.summary["histogram"]) == pytest.approx(1.0, abs=0.01)
    assert rich.summary["elasticity"]["status"] == "assumption"


def test_places_outside_the_data_get_no_income_layer():
    assert iu.build_context([28.6], [77.2], state=None, data=DATA) is None  # New Delhi
    assert iu.build_context([31.5], [-97.0], state=None, data=DATA) is None  # in the search box but far from any tract
    assert iu.build_context([], [], state=None, data=DATA) is None


ACS_TEXT = """GEO_ID|B19001_E001|B19001_M001|B19001_E002|B19001_M002
0100000US|100|1|60|1
0400000US48|50|1|30|1
1400000US48453001100|40|1|25|1
1400000US48453001200|null|1|25|1
1400000US48453001300|-666666666|1|25|1
"""


def test_acs_parser_keeps_nation_and_tracts_and_drops_suppressed_rows():
    assert build.parse_acs(ACS_TEXT, ["B19001_E001", "B19001_E002"]) == {"0100000US": [100.0, 60.0], "1400000US48453001100": [40.0, 25.0]}


def test_gazetteer_parser_reads_padded_columns():
    text = "USPS\tGEOID\tALAND\tINTPTLAT\tINTPTLONG   \nTX\t48453001100\t1\t 30.27\t -97.74\n"
    assert build.parse_gazetteer(text) == {"48453001100": (30.27, -97.74)}


def test_assemble_joins_files_and_skips_tiny_or_unlocated_tracts():
    t = build.TRACT
    income = {build.NATION: [100.0] * 16, t + "A": [10.0] * 16, t + "TINY": [1.0] * 16, t + "LOST": [10.0] * 16, t + "NOSIZE": [10.0] * 16}
    size = {build.NATION: [2.5], t + "A": [2.0], t + "TINY": [2.0], t + "LOST": [2.0]}
    places = {"A": (30.0, -97.0), "TINY": (30.0, -97.0), "NOSIZE": (30.0, -97.0)}
    d = build.assemble(income, size, places)
    assert d["id"].tolist() == ["A"]
    assert d["lat"][0] == 30.0 and d["hh_size"][0] == 2.0 and d["counts"].shape == (1, 16)
    assert float(d["nation_hh_size"]) == 2.5
