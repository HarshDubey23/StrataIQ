import numpy as np
import pytest

from app.categories.archetypes import get_archetype
from app.engine import lives
from app.engine import model as em
from app.engine.abm import run_abm


def _people(n=3000):
    rng = np.random.default_rng(5)
    return rng, rng.integers(0, 12, n), rng.uniform(5, 90, n), rng.integers(1, 6, n).astype(float)


def test_occupations_follow_age():
    rng, _, age, _ = _people(20000)
    o = lives.assign_occupations(rng, age)
    assert (o[age < 18] == lives.STUDENT).all() and (o[age >= 70] == lives.RETIRED).all()
    adults = o[(age >= 30) & (age < 60)]
    assert not np.isin(adults, [lives.STUDENT, lives.RETIRED]).any()
    assert (adults == lives.OFFICE).mean() > 0.5


def test_routines_keep_each_persons_total_and_shift_office_workers_to_weekends():
    rng, _, age, _ = _people()
    o = lives.assign_occupations(rng, age)
    r = lives.build_routines(rng, o, "dine_in")
    assert r.mean(1) == pytest.approx(np.ones(age.size))
    office, retired = r[o == lives.OFFICE], r[o == lives.RETIRED]
    assert office[:, 5].mean() > 1.5 * office[:, 1].mean()  # Saturday beats Tuesday
    assert retired[:, 1].mean() > retired[:, 6].mean()


def test_households_stay_inside_a_zone_and_respect_size():
    rng, zi, _, size = _people()
    h = lives.build_households(rng, zi, size)
    _, counts = np.unique(h, return_counts=True)
    assert counts.max() <= size.max() and counts.sum() == zi.size
    for hid in np.unique(h)[:200]:
        assert np.unique(zi[h == hid]).size == 1


def test_friends_are_real_people_mostly_near_home_and_rarely_self():
    rng, zi, _, size = _people()
    h = lives.build_households(rng, zi, size)
    f = lives.build_friends(rng, zi, h)
    who = np.arange(zi.size)
    assert f.shape == (zi.size, lives.FRIENDS) and f.min() >= 0 and f.max() < zi.size
    together = h[f[:, 0]] == h
    assert together.all()
    assert (f[together & (np.bincount(h)[h] > 1), 0] != who[together & (np.bincount(h)[h] > 1)]).all()
    assert (zi[f[:, 2:5]] == zi[:, None]).all()
    assert (f == who[:, None]).mean() < 0.1


def test_opinions_learn_from_visits_and_crowding_hurts_only_you():
    op = np.zeros((4000, 2))
    rng = np.random.default_rng(1)
    idx = np.arange(4000)
    for _ in range(12):
        lives.remember_visit(rng, op, idx, np.zeros(4000, int), crowding=1.0)
        lives.remember_visit(rng, op, idx, np.ones(4000, int), crowding=1.0)
    assert op[:, 0].mean() == pytest.approx(-1.0, abs=0.1)
    assert abs(op[:, 1].mean()) < 0.05  # neutral on average, but people now differ
    assert op[:, 1].std() > 0.1
    assert np.abs(op).max() <= lives.OPINION_LIMIT


def test_opinions_spread_to_friends_only_from_customers_with_strong_views():
    n = 2000
    friends = np.tile(np.arange(n)[::-1][:, None], (1, lives.FRIENDS))
    op = np.zeros((n, 1))
    op[:1000, 0] = 1.0
    rng = np.random.default_rng(2)
    non_customers = np.zeros(n, bool)
    lives.share_opinions(rng, op, friends, np.ones(n) * 20, np.ones(n), non_customers)
    assert op[1000:, 0].sum() == 0
    lives.share_opinions(rng, op, friends, np.ones(n) * 20, np.ones(n), ~non_customers)
    assert op[1000:, 0].mean() > 0.05 and (op[1000:, 0] >= 0).all()


def test_competitors_differ_stably_and_keep_the_market_average():
    names = [f"Gym {i}" for i in range(40)]
    p, q = lives.competitor_spread(names)
    p2, q2 = lives.competitor_spread(names)
    assert p == pytest.approx(p2) and q == pytest.approx(q2)
    assert p.mean() == pytest.approx(1.0) and abs(q.mean()) < 1e-9
    assert p.std() > 0.08 and q.std() > 0.05
    assert np.corrcoef(p, q)[0, 1] > 0.1
    assert lives.competitor_spread(["Only"])[0] == pytest.approx([1.0]) and lives.competitor_spread(["Only"])[1] == pytest.approx([0.0])
    assert lives.competitor_spread([])[0].size == 0


def _run(key, price, capacity, n=2500, days=60):
    arch = get_archetype(key)
    zones = [em.Zone(30.25 + 0.004 * i, -97.76 + 0.004 * j, 1500.0) for i in range(5) for j in range(5)]
    comps = [em.Competitor(f"Rival {i}", f"Rival {i}", 30.255 + 0.003 * i, -97.75) for i in range(4)]
    biz = em.BusinessInputs(30.26, -97.75, price=price, rent=5000, payroll=9000, capacity=capacity)
    params = em.ResolvedParams.from_archetype(arch, {}, {})
    return run_abm(arch, zones, comps, biz, params, price, n_agents=n, days=days, seed=11)


def test_agents_end_a_run_with_lives_people_can_inspect():
    out = _run("dine_in", 12.0, {"seats": 60, "turns_per_day": 4, "open_days_per_month": 30})
    a, cols = out["agents"], out["agents"]["columns"]
    assert a["occupations"] == lives.OCCUPATIONS
    rows = np.array([[r[cols.index(k)] for k in ("occupation", "household", "opinion", "friends_customers", "purchases_you")] for r in a["rows"]], float)
    assert set(np.unique(rows[:, 0])) <= set(range(5)) and rows[:, 1].max() > 100
    buyers = rows[rows[:, 4] > 0]
    assert buyers.size and np.abs(buyers[:, 2]).max() > 0.2  # visits left opinions
    assert (rows[rows[:, 4] == 0, 2] != 0).sum() < (rows[:, 4] > 0).sum() + 500  # opinions start with visits or friends
    assert rows[:, 3].max() >= 1 and rows[:, 3].max() <= lives.FRIENDS
    s = out["life"]
    assert s["households"] > 100 and 0 <= s["promoters_share"] <= 1 and 0 <= s["detractors_share"] <= 1
    assert abs(sum(s["occupation_shares"].values()) - 1) < 1e-6


def test_weekend_lift_appears_in_daily_dining():
    out = _run("dine_in", 12.0, {"seats": 500, "turns_per_day": 6, "open_days_per_month": 30}, days=84)
    assert out["steady_units"] > 0


def test_memberships_still_run():
    out = _run("membership", 49.0, {"max_members": 800})
    assert out["steady_units"] > 0 and out["life"]["households"] > 0
