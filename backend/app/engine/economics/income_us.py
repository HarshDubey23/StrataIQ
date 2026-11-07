"""US income layer: each zone takes the household income distribution of its census tract (ACS 5-year, table B19001).

Income is put on a per-person monthly basis, household income / average household size / 12, so the rest of the model
reads it like India's monthly per-person consumption. The rank that picks a person's spending class is national.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .income import IncomeContext

# ACS bracket edges in dollars a year.
# shortcut: the open $200k+ bracket is treated as ending at $500k; use a Pareto tail if high-end pricing needs it.
EDGES = np.array([0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 100, 125, 150, 200, 500], float) * 1000.0
HIST_EDGES = [0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 1e9]
CLASS_LABELS = ("Bottom 40% of the US by income", "Middle 40%", "Top 20%")
X_REF_NOTE = "US median monthly income per person, ACS 5-year"


class BracketCurve:
    """Piecewise-linear income distribution through the published bracket counts."""

    def __init__(self, counts: list[float], hh_size: float):
        c = np.asarray(counts, float) + 1e-6  # empty brackets must not leave flat runs in the inverse
        self._cdf = np.concatenate([[0.0], np.cumsum(c) / c.sum()])
        self._x = EDGES / 12.0 / hh_size

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

    def draw(self, rng: np.random.Generator, zi: np.ndarray, loading: float | None = None) -> tuple[np.ndarray, np.ndarray]:
        """Monthly income per person and national rank for people living in zones ``zi``."""
        u = rng.random(zi.size)
        x = np.empty(zi.size)
        for z in np.unique(zi):
            m = zi == z
            x[m] = self.zone_curve[z].ppf(u[m])
        return x, self.nat.cdf(x)


def nearest_tract(zone_lats: np.ndarray, zone_lngs: np.ndarray, tract_lats: np.ndarray, tract_lngs: np.ndarray) -> np.ndarray:
    # shortcut: nearest centroid approximates tract membership, which is enough at zone spacing; use polygons if zones shrink.
    k = np.cos(np.radians(zone_lats.mean()))
    d = (zone_lats[:, None] - tract_lats[None, :]) ** 2 + ((zone_lngs[:, None] - tract_lngs[None, :]) * k) ** 2
    return d.argmin(1)


def build_context(zone_lats, zone_lngs, data: dict, *, state: str | None) -> UsIncomeContext | None:
    tracts = data.get("tracts") or []
    if not tracts or len(np.atleast_1d(zone_lats)) == 0:
        return None
    lats, lngs = np.atleast_1d(np.asarray(zone_lats, float)), np.atleast_1d(np.asarray(zone_lngs, float))
    idx = nearest_tract(lats, lngs, np.array([t["lat"] for t in tracts]), np.array([t["lng"] for t in tracts]))
    curves = {i: BracketCurve(tracts[i]["counts"], tracts[i]["hh_size"]) for i in set(idx.tolist())}
    nat = BracketCurve(data["national"]["counts"], data["national"]["hh_size"])
    year = data.get("year")
    prov = [{"source": "us_census", "name": f"US Census ACS {year} 5-year, household income by tract (B19001)", "kind": "official_aggregate_estimate",
             "url": "https://www.census.gov/programs-surveys/acs", "license": "US government public data", "source_updated_at": f"ACS {year} 5-year",
             "detail": f"{len(curves)} tracts cover this catchment. Each zone uses its nearest tract; income per person = household income / average household size / 12"}]
    return UsIncomeContext("us_tract", np.full(lats.shape, np.nan), state, "urban", 0.0, prov, f"ACS {year}, {len(curves)} tracts", 0.0,
                           [curves[i] for i in idx.tolist()], nat)
