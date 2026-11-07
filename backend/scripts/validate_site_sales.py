"""Single-location backtest: forecast real Texas bars and restaurants, then compare with their reported sales.

Truth: Texas Comptroller mixed beverage gross receipts, 12 months per location. It covers alcohol sales only.
The engine never sees a location's sales. It sees only the location, Census tract data and nearby permit holders.
Cities are split in two: one scale factor is set on the first group, and all scores come from the second.

    MARKET=US python scripts/validate_site_sales.py <cache folder> [locations to forecast]
"""
from __future__ import annotations

import concurrent.futures as cf
import csv
import io
import json
import sys
import time
import zlib
from pathlib import Path

import httpx
import numpy as np
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.categories.archetypes import get_archetype  # noqa: E402
from app.engine import model as em  # noqa: E402
from app.engine.economics import behaviour as eb  # noqa: E402
from app.engine.economics import income_us as iu  # noqa: E402
from app.engine.simulate import simulate  # noqa: E402

API = "https://data.texas.gov/resource/naix-2893.json"
GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
WINDOW = ("2025-10-01T00:00:00", "2026-09-30T23:59:59")
RADIUS_DEG = 0.05  # about 5 km: tracts and rivals beyond this hardly affect a walk-in business
WORKER_SHARE = 0.3
PRICE = 30.0


def fetch_sales(cache: Path) -> list[dict]:
    f = cache / "sales.json"
    if f.exists():
        return json.loads(f.read_text())
    keys = "location_name,location_address,location_city,location_zip"
    r = httpx.get(API, params={"$select": f"{keys},sum(total_receipts) as sales,count(*) as months", "$where": f"obligation_end_date_yyyymmdd between '{WINDOW[0]}' and '{WINDOW[1]}'",
                               "$group": keys, "$limit": 60000}, timeout=300)
    r.raise_for_status()
    rows = [x for x in r.json() if int(x["months"]) >= 12 and float(x.get("sales") or 0) > 0]
    f.write_text(json.dumps(rows))
    return rows


def parse_geocoded(text: str) -> dict[int, tuple[float, float]]:
    out = {}
    for row in csv.reader(io.StringIO(text)):
        if len(row) >= 6 and row[2] == "Match" and "," in row[5]:
            lng, lat = row[5].split(",")
            out[int(row[0])] = (float(lat), float(lng))
    return out


def geocode(rows: list[dict], cache: Path) -> dict[int, tuple[float, float]]:
    f = cache / "geocoded.json"
    done = {int(k): tuple(v) for k, v in json.loads(f.read_text()).items()} if f.exists() else {}
    attempted = cache / "attempted.json"
    tried = set(json.loads(attempted.read_text())) if attempted.exists() else set()
    todo = [i for i in range(len(rows)) if i not in tried]
    for start in range(0, len(todo), 2000):
        ids = todo[start:start + 2000]
        buf = io.StringIO()
        w = csv.writer(buf)
        for i in ids:
            x = rows[i]
            w.writerow([i, x["location_address"], x["location_city"], "TX", x["location_zip"]])
        try:
            r = httpx.post(GEOCODER, data={"benchmark": "Public_AR_Current"}, files={"addressFile": ("a.csv", buf.getvalue(), "text/csv")}, timeout=600)
            r.raise_for_status()
        except httpx.HTTPError as e:
            print(f"geocoder batch failed, will retry on the next run: {type(e).__name__}", flush=True)
            continue
        done.update(parse_geocoded(r.text))
        tried.update(ids)
        f.write_text(json.dumps(done))
        attempted.write_text(json.dumps(sorted(tried)))
        print(f"geocoded {len(done)} of {len(tried)} tried, {len(rows)} total", flush=True)
    return done


def nearby(lat, lng, lats, lngs, deg=RADIUS_DEG):
    return np.flatnonzero((np.abs(lats - lat) < deg) & (np.abs(lngs - lng) < deg * 1.15))


_shared: dict = {}


def _init(points):
    d = iu.load_tracts()
    _shared.update(points=points, tracts=d, people=d["age_sex"].sum(1).astype(float), arch=get_archetype("dine_in"))


def forecast(i: int) -> tuple[int, float | None, float, int]:
    """Modeled monthly sales units for location i, the people near it and the rivals near it. Uses no sales figures."""
    lat, lng, _ = _shared["points"][i]
    d, pts = _shared["tracts"], _shared["points"]
    near = nearby(lat, lng, d["lat"], d["lng"])
    if near.size == 0:
        return i, None, 0.0, 0
    zones = [em.Zone(float(d["lat"][k]), float(d["lng"][k]), float(_shared["people"][k]), float(d["jobs"][k]) * WORKER_SHARE / 120.0) for k in near]
    rivals = nearby(lat, lng, pts[:, 0], pts[:, 1])
    rivals = rivals[rivals != i]
    comps = [em.Competitor(str(j), f"r{j}", float(pts[j, 0]), float(pts[j, 1])) for j in rivals[:150]]
    arch = _shared["arch"]
    biz = em.BusinessInputs(lat, lng, price=PRICE, quality=0.5, marketing_spend=1e7, rent=1, payroll=1, capacity={"seats": 100000, "turns_per_day": 10, "open_days_per_month": 30})
    ctx = iu.build_context([z.lat for z in zones], [z.lng for z in zones], state="Texas", data=d)
    beh = eb.build(arch, "restaurant", ctx, len(zones), samples_per_zone=40, seed=i, ref_price=PRICE)
    try:
        res = simulate(eb.apply(arch, beh), zones, comps, biz, {}, mc_draws=2, seed=1, evidence=beh.params, seg_share_z=beh.zone_shares, with_sensitivity=False)
    except Exception as e:  # one awkward location must not end a run of thousands
        print(f"location {i} failed: {type(e).__name__}", flush=True)
        return i, None, 0.0, 0
    dist = np.hypot(d["lat"][near] - lat, (d["lng"][near] - lng) * 0.87)
    return i, float(res["summary"]["modeled_demand_units"]), float(_shared["people"][near][dist < 0.02].sum()), int(rivals.size)


def score(pred: np.ndarray, truth: np.ndarray, train: np.ndarray) -> dict:
    """Set one scale on training cities, then score only the held-out ones."""
    k = np.exp(np.mean(np.log(truth[train]) - np.log(pred[train])))
    p, t = pred[~train] * k, truth[~train]
    ratio = np.maximum(p / t, t / p)
    return {"n": int((~train).sum()), "spearman": float(spearmanr(p, t).statistic), "median_abs_pct_error": float(np.median(np.abs(p - t) / t)),
            "within_2x": float((ratio <= 2).mean()), "within_1_5x": float((ratio <= 1.5).mean()),
            "log_r2": float(1 - ((np.log(t) - np.log(p)) ** 2).sum() / ((np.log(t) - np.log(t).mean()) ** 2).sum())}


def main(cache: Path, n: int) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    rows = fetch_sales(cache)
    print(f"{len(rows)} locations with 12 months of sales", flush=True)
    located = geocode(rows, cache)
    ids = sorted(located)
    print(f"{len(ids)} geocoded", flush=True)
    points = np.array([[*located[i], float(rows[i]["sales"]) / 12] for i in ids])
    picks = np.random.default_rng(7).permutation(len(ids))[:n]
    out_file = cache / "forecasts.json"
    results = {int(k): v for k, v in json.loads(out_file.read_text()).items()} if out_file.exists() else {}
    todo = [int(i) for i in picks if int(i) not in results]
    t0 = time.time()
    with cf.ProcessPoolExecutor(4, initializer=_init, initargs=(points,)) as pool:
        for c, (i, units, people, rivals) in enumerate(pool.map(forecast, todo, chunksize=20), 1):
            results[i] = [units, people, rivals]
            if c % 200 == 0:
                out_file.write_text(json.dumps(results))
                print(f"forecast {c}/{len(todo)} in {time.time() - t0:.0f}s", flush=True)
    out_file.write_text(json.dumps(results))

    use = [i for i in results if results[i][0] and results[i][0] > 0]
    truth = points[use, 2]
    cities = [rows[ids[i]]["location_city"].strip().upper() for i in use]
    train = np.array([zlib.crc32(c.encode()) % 2 == 0 for c in cities])
    model = np.array([results[i][0] for i in use])
    naive = np.full(len(use), 1.0)
    crowd = np.array([max(results[i][1], 1.0) / (1 + results[i][2]) for i in use])
    report = {"locations": len(use), "train_cities": len(set(np.array(cities)[train])), "test_cities": len(set(np.array(cities)[~train])),
              "median_monthly_sales": float(np.median(truth)), "model": score(model, truth, train), "same_number_for_all": score(naive, truth, train), "people_per_rival": score(crowd, truth, train)}
    by = {}
    for city in ("HOUSTON", "SAN ANTONIO", "AUSTIN", "DALLAS", "FORT WORTH", "EL PASO"):
        mask = np.array([c == city for c in cities])
        if mask.sum() > 30:
            k = np.exp(np.mean(np.log(truth[train]) - np.log(model[train])))
            by[city] = {"n": int(mask.sum()), "held_out": bool(not train[mask][0]), "spearman": float(spearmanr(model[mask], truth[mask]).statistic), "median_abs_pct_error": float(np.median(np.abs(model[mask] * k - truth[mask]) / truth[mask]))}
    report["by_city"] = by
    (cache / "report.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main(Path(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 6000)
