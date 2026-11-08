"""Decision search: site scan, strategy optimizer, capacity costs, quick-start parsing."""
from dataclasses import replace

import numpy as np

from app.categories.archetypes import ARCHETYPES
from app.engine.explore import optimize, scaled_business, site_scan
from app.engine.model import BusinessInputs, Competitor, ResolvedParams, Zone

LAT, LNG = 28.6315, 77.2167


def _market():
    xs = np.linspace(-0.025, 0.025, 12)
    r = np.random.default_rng(3)
    zones = [Zone(LAT + a, LNG + b, float(r.gamma(2, 900)), 0.0) for a in xs for b in xs]
    comps = [Competitor(f"c{i}", f"Comp {i}", LAT + r.uniform(-.02, .02), LNG + r.uniform(-.02, .02)) for i in range(15)]
    biz = BusinessInputs(lat=LAT, lng=LNG, price=450.0, quality=0.55, marketing_spend=40000.0, variable_cost_per_unit=235,
                         capacity={"max_orders_per_day": 220, "open_days_per_month": 30}, rent=400000, payroll=260000,
                         utilities=55000, other_fixed=40000, startup_cost=4500000)
    return ARCHETYPES["takeaway"], zones, comps, biz


def test_capacity_is_not_free():
    arch, _, _, biz = _market()
    b2 = scaled_business(arch, biz, 1.5)
    assert b2.capacity["max_orders_per_day"] == 330 and b2.capacity["open_days_per_month"] == 30
    assert b2.payroll == biz.payroll * 1.5 and b2.rent > biz.rent and b2.startup_cost > biz.startup_cost


def test_site_scan_ranks_sites_and_keeps_current():
    arch, zones, comps, biz = _market()
    out = site_scan(arch, zones, comps, biz, ResolvedParams.from_archetype(arch), 3.0)
    assert out["current"]["current"] is True
    assert 1 <= len(out["top"]) <= 5
    profits = [t["profit"] for t in out["top"]]
    assert profits == sorted(profits, reverse=True)
    assert "risk" in out["current"] and 0 <= out["current"]["risk"]["prob_loss"] <= 1


def test_optimizer_never_worse_than_current():
    arch, zones, comps, biz = _market()
    out = optimize(arch, zones, comps, biz, ResolvedParams.from_archetype(arch))
    assert out["best"]["profit"] >= out["current"]["profit"]
    assert out["best_without_new_capacity"]["capacity_scale"] == 1.0
    assert out["evaluated"] == len(out["prices"]) * len(out["spends"]) * len(out["scales"])


def test_optimizer_works_at_any_price():
    # $57.50 and $47 used to crash: the grid rounded to $5 steps and lost the current plan
    arch, zones, comps, biz = _market()
    for price, vc in ((57.5, 20.0), (47.0, 15.0), (4.75, 1.5)):
        b = replace(biz, price=price, variable_cost_per_unit=vc, marketing_spend=1500.0)
        out = optimize(arch, zones, comps, b, ResolvedParams.from_archetype(arch))
        assert out["current"]["price"] == price and out["current"]["marketing_spend"] == 1500.0
        assert len(out["prices"]) >= 6 and out["best"]["profit"] >= out["current"]["profit"]


def test_quickstart_reads_english_and_hinglish():
    from app.api.quickstart import parse_idea
    p = parse_idea("I want to open a cafe in Indiranagar, Bengaluru with price 250 and budget 20 lakh")
    assert p["place"] == "Indiranagar, Bengaluru" and p["price"] == 250 and p["budget"] == 2_000_000
    h = parse_idea("Mujhe Koramangala mein ek pizza shop kholna hai")
    assert h["place"] == "Koramangala" and "pizza" in h["business"]


def test_children_do_not_drive():
    from app.engine import genome as gm
    rng = np.random.default_rng(1)
    N = 4000
    age = rng.uniform(0, 80, N)
    gen = gm.generate(np.random.default_rng(2), age=age, female=rng.random(N) < 0.5, seg_keys=["a"], seg=np.zeros(N, int),
                      zone_pop=np.array([1.0]), zone_act=np.array([0.0]), lat=np.full(N, 25.45), lng=np.full(N, 81.83), zi=np.zeros(N, int),
                      blat=np.array([25.45]), blng=np.array([81.83]), circuity=1.3, max_km=5, seg_dt=np.ones(N))
    mode = gen.G[:, gm.KI["ev_mode"]].astype(int)
    assert not ((age < 18) & (mode == gm.MODE_INDEX["car"])).any()
    assert not ((age < 16) & (mode == gm.MODE_INDEX["two_wheeler"])).any()
    assert ((age >= 18) & (mode == gm.MODE_INDEX["car"])).any()  # adults still drive


def test_india_first_look_uses_the_official_state_curve():
    # MoSPI HCES 2023-24: a city in Uttar Pradesh spends more per person than its villages, and the median is in the right range
    from app.engine.economics import income
    up_urban = income.curve("urban", income.normalise_state("Uttar Pradesh")).median
    up_rural = income.curve("rural", income.normalise_state("Uttar Pradesh")).median
    assert 3500 < up_urban < 6500 and 2500 < up_rural < up_urban
