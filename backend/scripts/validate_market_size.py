"""Test modeled market size against real county business data the model never sees.

Prediction: residents x their income effect, from our ACS tract extract.
Truth: annual payroll of the industry in the county, from Census County Business Patterns 2022.
Half the counties fit one scale factor; the other half score it. Population alone is the baseline to beat.

    python scripts/validate_market_size.py path/to/cbp22co.zip
"""
from __future__ import annotations

import csv
import io
import sys
import zipfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine.economics import behaviour as eb  # noqa: E402
from app.engine.economics import income_us as iu  # noqa: E402

# NAICS code and the model's income elasticity group for each business type.
INDUSTRIES = {
    "gym": ("713940", "membership"), "coffee shop": ("722515", "dine_in"), "full-service restaurant": ("722511", "dine_in"),
    "beauty salon": ("812112", "appointment"), "barber": ("812111", "appointment"), "dentist": ("621210", "health"),
    "grocery": ("445110", "retail"), "pharmacy": ("446110", "retail"), "clothing store": ("448140", "retail"),
}
MIN_COUNTY_PEOPLE = 20_000  # small counties have suppressed or lumpy payroll


def read_payroll(path: str, codes: set[str]) -> dict[tuple[str, str], float]:
    """{(county fips, naics): annual payroll in $1000}, leaving out counties with no reported payroll."""
    out = {}
    with zipfile.ZipFile(path) as z, z.open(z.namelist()[0]) as f:
        for row in csv.DictReader(io.TextIOWrapper(f, "latin-1")):
            if row["naics"] in codes and float(row["ap"] or 0) > 0:
                out[(row["fipstate"] + row["fipscty"], row["naics"])] = float(row["ap"])
    return out


def score(pred: np.ndarray, truth: np.ndarray, train: np.ndarray) -> dict:
    """Fit one scale factor on the training counties, then score the others."""
    k = truth[train].sum() / pred[train].sum()
    p, t = k * pred[~train], truth[~train]
    log_p, log_t = np.log(p), np.log(t)
    return {"r2_log": 1 - ((log_t - log_p) ** 2).sum() / ((log_t - log_t.mean()) ** 2).sum(), "corr_log": float(np.corrcoef(log_p, log_t)[0, 1]),
            "wape": float(np.abs(p - t).sum() / t.sum()), "median_ape": float(np.median(np.abs(p - t) / t))}


def main(path: str) -> None:
    d = iu.load_tracts()
    county = np.array([i[:5] for i in d["id"]])
    people = d["age_sex"].sum(1).astype(float)
    nat = iu.BracketCurve(d["nation_counts"], d["nation_hh_size"])
    # A tract's average of (income / national median)^elasticity, across its brackets.
    centres = (iu.EDGES[:-1] + iu.EDGES[1:]) / 2 / 12 / d["hh_size"][:, None]
    shares = d["counts"] / d["counts"].sum(1, keepdims=True)
    payroll = read_payroll(path, {c for c, _ in INDUSTRIES.values()})
    keys, inverse = np.unique(county, return_inverse=True)
    pop = np.bincount(inverse, people)
    rng = np.random.default_rng(7)
    train_county = rng.random(keys.size) < 0.5
    print(f"{'business':26s}{'counties':>9s}  {'income model':>26s}  {'population only':>26s}")
    print(f"{'':26s}{'':>9s}  {'corr   r2   median err':>26s}  {'corr   r2   median err':>26s}")
    for name, (code, group) in INDUSTRIES.items():
        eps = eb.ELASTICITY[group][0] * eb.US_ELASTICITY_SCALE
        lift = (shares * (centres / nat.median) ** eps).sum(1)
        market = np.bincount(inverse, people * lift)
        truth = np.array([payroll.get((k, code), np.nan) for k in keys])
        use = np.isfinite(truth) & (pop >= MIN_COUNTY_PEOPLE)
        if use.sum() < 50:
            print(f"{name:26s} too few counties ({int(use.sum())})")
            continue
        model = score(market[use], truth[use], train_county[use])
        base = score(pop[use], truth[use], train_county[use])
        print(f"{name:26s}{int(use.sum()):9d}  {model['corr_log']:.3f} {model['r2_log']:.3f} {model['median_ape']:10.0%}   {base['corr_log']:.3f} {base['r2_log']:.3f} {base['median_ape']:10.0%}")
        # Fit the elasticity on training counties only, then score it on the held-out ones.
        fit = np.arange(-0.5, 3.01, 0.05)
        tr = use & train_county
        err = []
        for e in fit:
            m = np.bincount(inverse, people * (shares * (centres / nat.median) ** e).sum(1))
            err.append(np.var(np.log(truth[tr]) - np.log(m[tr])))
        best = float(fit[int(np.argmin(err))])
        fitted = score(np.bincount(inverse, people * (shares * (centres / nat.median) ** best).sum(1))[use], truth[use], train_county[use])
        print(f"{'  fitted elasticity ' + format(best, '.2f'):26s}{'':9s}  {fitted['corr_log']:.3f} {fitted['r2_log']:.3f} {fitted['median_ape']:10.0%}")


if __name__ == "__main__":
    main(sys.argv[1])
