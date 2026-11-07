"""US income layer: each zone takes the household income distribution of its census tract (ACS 5-year, table B19001).

Income is put on a per-person monthly basis, household income / average household size / 12, so the rest of the model
reads it like India's monthly per-person consumption. The rank that picks a person's spending class is national.
The tract extract ships with the app, built by scripts/build_us_tracts.py from the Census Bureau's public files.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from .income import DATA, IncomeContext

DATA_FILE = DATA / "us_tracts_acs2023.npz"
# ACS bracket edges in dollars a year.
# shortcut: the open $200k+ bracket is treated as ending at $500k; use a Pareto tail if high-end pricing needs it.
EDGES = np.array([0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 100, 125, 150, 200, 500], float) * 1000.0
HIST_EDGES = [0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 1e9]
CLASS_LABELS = ("Bottom 40% of the US by income", "Middle 40%", "Top 20%")
X_REF_NOTE = "US median monthly income per person, ACS 5-year"
MAX_TRACT_DEGREES = 0.5  # a zone further than this from any tract centroid is outside the US data


class BracketCurve:
    """Piecewise-linear income distribution through the published bracket counts."""

    def __init__(self, counts, hh_size: float):
        c = np.asarray(counts, float) + 1e-6  # empty brackets must not leave flat runs in the inverse
        self._cdf = np.concatenate([[0.0], np.cumsum(c) / c.sum()])
        self._x = EDGES / 12.0 / float(hh_size)

    def ppf(self, u):
        return np.interp(u, self._cdf, self._x)

    def cdf(self, x):
        return np.interp(x, self._x, self._cdf)

    @property
    def median(self) -> float:
        return float(self.ppf(0.5))


@dataclass
class UsIncomeContext(IncomeContext):
    nat: BracketCurve | None = None
    people: dict | None = None  # [Z] real demographics of each zone's tract, see zone_people()

    def draw(self, rng: np.random.Generator, zi: np.ndarray, loading: float | None = None) -> tuple[np.ndarray, np.ndarray]:
        """Monthly income per person and national rank for people living in zones ``zi``."""
        u = rng.random(zi.size)
        x = np.empty(zi.size)
        for z in np.unique(zi):
            m = zi == z
            x[m] = self.zone_curve[z].ppf(u[m])
        return x, self.nat.cdf(x)


@lru_cache(maxsize=1)
def load_tracts() -> dict | None:
    if not DATA_FILE.exists():
        return None
    with np.load(DATA_FILE) as g:
        return {k: g[k] for k in g.files}


def nearest_tract(zone_lats: np.ndarray, zone_lngs: np.ndarray, tract_lats: np.ndarray, tract_lngs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Index of each zone's nearest tract and its distance in degrees of latitude."""
    # shortcut: nearest centroid approximates tract membership, which is enough at zone spacing; use polygons if zones shrink.
    k = np.cos(np.radians(zone_lats.mean()))
    near = np.flatnonzero((np.abs(tract_lats - zone_lats.mean()) < 2) & (np.abs(tract_lngs - zone_lngs.mean()) < 3))
    if near.size == 0:
        return np.zeros(zone_lats.shape, int), np.full(zone_lats.shape, np.inf)
    d = (zone_lats[:, None] - tract_lats[near][None, :]) ** 2 + ((zone_lngs[:, None] - tract_lngs[near][None, :]) * k) ** 2
    best = d.argmin(1)
    return near[best], np.sqrt(d[np.arange(zone_lats.size), best])


def zone_people(data: dict, idx: np.ndarray) -> dict:
    """Each zone's tract, as the shares agents are drawn from. All figures are ACS 5-year estimates."""
    age_sex = data["age_sex"][idx].astype(float)
    modes = data["modes"][idx].astype(float)
    bands = age_sex[:, :17] + age_sex[:, 17:]
    adults = 0.4 * bands[:, 3] + bands[:, 4:13].sum(1)  # about 18 to 64; two fifths of the 15-19 band are 18 or 19
    young = np.maximum(0.4 * bands[:, 3] + bands[:, 4], 1.0)  # about 18 to 24
    # shortcut: a tract's jobs are shared evenly among zones in the catchment, so a partly covered tract counts in full; use block-level jobs if edges matter.
    _, inverse, zones_in_tract = np.unique(idx, return_inverse=True, return_counts=True)
    return {"age_sex": age_sex, "modes": modes, "hh_size": data["hh_size"][idx].astype(float), "zone_jobs": data["jobs"][idx] / zones_in_tract[inverse],
            "employed_rate": np.clip(data["employed"][idx] / np.maximum(adults, 1.0), 0.0, 0.98),
            "college_rate": np.clip(data["college"][idx] / young, 0.0, 0.95)}


def draw_age_sex(rng: np.random.Generator, zi: np.ndarray, age_sex: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Age band and sex for people in zones ``zi``, from each zone's own 17 male + 17 female band counts."""
    band, female = np.empty(zi.size, int), np.empty(zi.size, bool)
    for z in np.unique(zi):
        at = np.flatnonzero(zi == z)
        p = age_sex[z] + 1e-9
        pick = rng.choice(34, size=at.size, p=p / p.sum())
        band[at], female[at] = pick % 17, pick >= 17
    return band, female


def build_context(zone_lats, zone_lngs, *, state: str | None, data: dict | None = None) -> UsIncomeContext | None:
    """The income layer for a catchment, or None when the extract is missing or the zones are outside it."""
    data = data if data is not None else load_tracts()
    lats, lngs = np.atleast_1d(np.asarray(zone_lats, float)), np.atleast_1d(np.asarray(zone_lngs, float))
    if data is None or lats.size == 0:
        return None
    idx, dist = nearest_tract(lats, lngs, data["lat"], data["lng"])
    if np.median(dist) > MAX_TRACT_DEGREES:
        return None
    curves = {i: BracketCurve(data["counts"][i], data["hh_size"][i]) for i in set(idx.tolist())}
    year = int(data["year"])
    prov = [{"source": "us_census", "name": f"US Census ACS {year} 5-year, household income by tract (B19001, B25010)", "kind": "official_aggregate_estimate",
             "url": "https://www.census.gov/programs-surveys/acs", "license": "US government public data", "source_updated_at": f"ACS {year} 5-year",
             "detail": f"{len(curves)} tracts cover this catchment. Each zone uses its nearest tract for income, age, sex, household size, job status, college enrolment and commute mode; "
                       "income per person = household income / average household size / 12"}]
    return UsIncomeContext("us_tract", np.full(lats.shape, np.nan), state, "urban", 0.0, prov, f"ACS {year}, {len(curves)} tracts", 0.0,
                           [curves[i] for i in idx.tolist()], BracketCurve(data["nation_counts"], data["nation_hh_size"]), zone_people(data, idx))
