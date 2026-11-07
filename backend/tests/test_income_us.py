import importlib.util
from pathlib import Path

import numpy as np
import pytest

from app.categories.archetypes import ARCHETYPES
from app.engine import lives
from app.engine import model as em
from app.engine.abm import run_abm
from app.engine.economics import behaviour as eb
from app.engine.economics import income_us as iu
from app.engine.simulate import simulate

# Household counts per bracket: poor, rich, and a national mix. Synthetic, shaped like ACS B19001.
POOR = [300, 200, 150, 120, 100, 80, 70, 60, 50, 40, 30, 15, 8, 4, 2, 1]
RICH = [5, 5, 5, 5, 10, 10, 15, 15, 20, 40, 80, 180, 220, 200, 240, 300]
NATION = [60, 40, 40, 40, 40, 40, 40, 40, 40, 70, 100, 130, 100, 70, 80, 90]
# Tract 0 is young and walks; tract 1 is old and drives.
YOUNG = [0, 0, 0, 100, 900, 900, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
OLD = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 400, 400, 200, 100]
DATA = {"lat": np.array([30.0, 30.1]), "lng": np.array([-97.0, -97.0]), "counts": np.array([POOR, RICH]), "hh_size": np.array([3.0, 2.2]),
        "age_sex": np.array([YOUNG + [2 * x for x in YOUNG], OLD + OLD]), "modes": np.array([[800, 0, 100, 0, 100, 0, 0], [0, 0, 1000, 0, 0, 0, 0]]),
        "employed": np.array([5000, 100]), "college": np.array([3000, 0]), "jobs": np.array([900, 30]),
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
    # Local demand follows incomes, from the fit against real county payroll, within limits.
    assert rich.params["participation"][0] > poor.params["participation"][0] > 0
    assert rich.params["participation"][3] == "derived" and "Census payroll" in rich.params["participation"][4]
    base = arch.params["participation"].value
    assert base * 0.25 <= poor.params["participation"][0] and rich.params["participation"][0] <= base * 4
    # India's labels must not leak into a US catchment.
    assert "India" not in " ".join(c["label"] for c in rich.summary["classes"])
    assert rich.summary["histogram"][-1]["hi"] is None and sum(h["share"] for h in rich.summary["histogram"]) == pytest.approx(1.0, abs=0.01)
    assert rich.summary["elasticity"]["status"] == "assumption"


def test_agents_inherit_their_own_tracts_age_sex_jobs_and_commute():
    ctx = iu.build_context([30.0, 30.1], [-97.0, -97.0], state="Texas", data=DATA)
    zi = np.repeat([0, 1], 20000)
    band, female = iu.draw_age_sex(np.random.default_rng(1), zi, ctx.people["age_sex"])
    assert set(np.unique(band[zi == 0])) == {3, 4, 5, 6} and set(np.unique(band[zi == 1])) == {11, 12, 13, 14, 15, 16}
    assert female[zi == 0].mean() == pytest.approx(2 / 3, abs=0.02)  # tract 0 has twice as many women in this fixture
    assert female[zi == 1].mean() == pytest.approx(0.5, abs=0.02)
    assert ctx.people["college_rate"][0] > 0.5 and ctx.people["college_rate"][1] == 0
    assert ctx.people["employed_rate"][1] < ctx.people["employed_rate"][0]
    age = np.where(zi == 0, 22.0, 45.0)
    occupation = lives.assign_occupations(np.random.default_rng(2), age, ctx.people["employed_rate"][zi], ctx.people["college_rate"][zi])
    assert (occupation[zi == 0] == lives.STUDENT).mean() > 0.5 and (occupation[zi == 1] == lives.STUDENT).sum() == 0
    assert (occupation[zi == 1] == lives.HOME).mean() == pytest.approx(1 - ctx.people["employed_rate"][1], abs=0.02)


def test_real_commute_shares_are_reproduced_by_agents():
    arch = ARCHETYPES["membership"]
    zones = [em.Zone(30.0, -97.0, 5000.0), em.Zone(30.1, -97.0, 5000.0)]
    biz = em.BusinessInputs(30.05, -97.0, price=49.0, rent=1, payroll=1, capacity={"max_members": 700})
    ctx = iu.build_context([30.0, 30.1], [-97.0, -97.0], state="Texas", data=DATA)
    beh = eb.build(arch, "gym", ctx, 2)
    arch2 = eb.apply(arch, beh)
    out = run_abm(arch2, zones, [], biz, em.ResolvedParams.from_archetype(arch2, {}, beh.params), 49.0, n_agents=8000, days=7, seed=4, income=ctx, behaviour=beh)
    c = out["agents"]["columns"]
    rows = out["agents"]["rows"]
    mode, zone = (np.array([r[c.index(k)] for r in rows]) for k in ("mode", "zone"))
    assert (mode[zone == 0] == 0).mean() == pytest.approx(0.8, abs=0.03)  # walkers
    assert (mode[zone == 1] == 2).mean() > 0.97  # drivers
    assert out["age_source"] == "us_census_tract" and "commute mode" in out["life"]["data_based"]


def test_jobs_add_up_by_tract_and_are_shared_across_its_zones():
    text = "w_geocode,C000,CA01\n480019501001005,20,4\n480019501001006,5,1\n480019502001001,7,2\n"
    assert build.tract_jobs(text) == {"48001950100": 25, "48001950200": 7}
    ctx = iu.build_context([30.0, 30.001, 30.1], [-97.0, -97.0, -97.0], state="Texas", data=DATA)
    assert ctx.people["zone_jobs"].tolist() == [450, 450, 30]


def test_people_tables_group_and_join_correctly():
    assert build.group_age_sex(list(range(46)))[:5] == [0, 1, 2, 3 + 4, 5 + 6 + 7]
    assert build.group_age_sex(list(range(46)))[16] == 21 + 22 and build.group_age_sex(list(range(46)))[17] == 23
    assert len(build.group_age_sex([1] * 46)) == 34 and sum(build.group_age_sex([1] * 46)) == 46
    assert build.combine_modes(dict.fromkeys([c for g in build.MODE_COLUMNS for c in g], 2.0)) == [2, 2, 2, 2, 2, 6, 2]


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


real_data = pytest.mark.skipif(iu.load_tracts() is None or "jobs" not in iu.load_tracts(), reason="US tract extract not built")


@real_data
def test_real_extract_matches_published_national_median_and_known_places():
    d = iu.load_tracts()
    assert len(d["id"]) > 80_000
    median_household = iu.BracketCurve(d["nation_counts"], d["nation_hh_size"]).median * 12 * float(d["nation_hh_size"])
    assert median_household == pytest.approx(78_538, rel=0.02)  # ACS 2019-2023 published national median
    median = lambda la, ln: iu.build_context([la], [ln], state=None).zone_curve[0].median  # noqa: E731
    assert median(37.4613, -122.1975) > 4 * median(40.8176, -73.9182)  # Atherton CA vs South Bronx NY
    transit = lambda la, ln: (lambda m: m[4:6].sum() / m.sum())(iu.build_context([la], [ln], state=None).people["modes"][0])  # noqa: E731
    assert transit(40.8176, -73.9182) > 0.3 > transit(33.45, -90.65)  # South Bronx rides transit, the Mississippi Delta does not
    assert iu.build_context([28.6315], [77.2167], state=None) is None  # New Delhi
    jobs = lambda la, ln: iu.build_context([la], [ln], state=None).people["zone_jobs"][0]  # noqa: E731
    assert jobs(30.2672, -97.7431) > 5 * jobs(33.45, -90.65)  # Downtown Austin vs the Mississippi Delta


@real_data
def test_real_us_catchment_runs_end_to_end_with_believable_prices():
    arch = ARCHETYPES["membership"]
    zones = [em.Zone(30.25 + 0.004 * i, -97.76 + 0.004 * j, 900.0) for i in range(4) for j in range(4)]
    comps = [em.Competitor("c1", "Rival", 30.26, -97.75)]
    biz = em.BusinessInputs(30.256, -97.754, price=49, rent=12000, payroll=14000)
    ctx = iu.build_context([z.lat for z in zones], [z.lng for z in zones], state="Texas")
    beh = eb.build(arch, "gym", ctx, len(zones))
    # the top income class should pay more, but not several times the local price
    wtp = [c["wtp_multiplier"] for c in beh.summary["classes"]]
    assert wtp[0] < wtp[1] < wtp[2] < 3.0 and wtp[2] > 1.3 and 0.4 < wtp[0] < 1.0
    arch2 = eb.apply(arch, beh)
    assert simulate(arch2, zones, comps, biz, {}, mc_draws=40, seed=1, evidence=beh.params, seg_share_z=beh.zone_shares, with_sensitivity=False)["summary"]
    params = em.ResolvedParams.from_archetype(arch2, {}, beh.params)
    assert params.status["participation"] == "derived"
    out = run_abm(arch2, zones, comps, biz, params, 49.0, n_agents=600, days=14, seed=3, income=ctx, behaviour=beh)
    cols = out["agents"]["columns"]
    income = np.array([r[cols.index("mpce")] for r in out["agents"]["rows"]], float)
    pay = np.array([r[cols.index("wtp")] for r in out["agents"]["rows"]], float)
    assert (income > 0).all() and np.corrcoef(np.log(income), np.log(pay))[0, 1] > 0.3
    assert 15 < np.median(pay) < 200  # dollars a month for a $49 gym, not rupee-scale numbers


@real_data
def test_income_does_not_decide_who_is_in_the_market():
    """Regression: income and in-market draws once shared a random stream, leaving only the poorest agents in the market."""
    arch = ARCHETYPES["membership"]
    zones = [em.Zone(30.25 + 0.004 * i, -97.76 + 0.004 * j, 1200.0) for i in range(6) for j in range(6)]
    comps = [em.Competitor(f"Rival {i}", f"Rival {i}", 30.255 + 0.004 * i, -97.75) for i in range(6)]
    biz = em.BusinessInputs(30.26, -97.745, price=49.0, rent=7000, payroll=14000, capacity={"max_members": 700})
    ctx = iu.build_context([z.lat for z in zones], [z.lng for z in zones], state="Texas")
    beh = eb.build(arch, "gym", ctx, len(zones))
    arch2 = eb.apply(arch, beh)
    out = run_abm(arch2, zones, comps, biz, em.ResolvedParams.from_archetype(arch2, {}, beh.params), 49.0, n_agents=5000, days=60, seed=1, income=ctx, behaviour=beh)
    cols, rows = out["agents"]["columns"], out["agents"]["rows"]
    income = np.array([r[cols.index("mpce")] for r in rows], float)
    in_market = np.array([r[cols.index("in_market")] for r in rows], bool)
    assert in_market.sum() > 100
    assert 0.6 < np.median(income[in_market]) / np.median(income) < 1.8
    assert out["steady_units"] > 40  # a $49 gym among 43,000 people should not be left with a handful of members
