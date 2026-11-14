"""Build backend/app/data/wealth_grid_ind.npz: which ~2.4 km tiles of India are better off, from night lights.

Both inputs allow commercial use (Meta's Relative Wealth Index, used here before, is CC BY-NC and was removed for that reason):

1. Night lights: "The global NPP-VIIRS-like nighttime light data (Version 2)", Chen, Yu et al., Harvard Dataverse,
   doi:10.7910/DVN/YGIVCD, CC0 1.0. Annual radiance at 15 arc-seconds (about 500 m).
2. Population: WorldPop Global 1 km, UN-adjusted, 2020, India (CC BY 4.0). Weights the tiles and sets urban/rural.
3. States: geoBoundaries IND ADM1 (CC BY 4.0).

A tile's index is its mean radiance. Tiles are ranked by it within their state x urban/rural, weighted by population
(ties broken by density), which is the rank the income layer matches onto the official HCES curve.

What the index is worth (measured against Meta's index on the same tiles, as an internal check only; see docs/VALIDATION.md):
rank correlation 0.70 across urban India and 0.51 across rural India; inside one city a median of 0.40 over 15 cities,
from 0.7-0.8 in Prayagraj, Kanpur, Varanasi, Patna and Indore down to 0.1-0.2 in Bengaluru, Jaipur and Pune.
So the income layer uses a smaller between-tile loading with this grid (LOADING below) than it did with Meta's.

Needs rasterio and shapely (not in requirements.txt). The lights file is 100 MB zipped and 12 GB unpacked, so it is read
inside the zip. Usage: python scripts/build_wealth_grid.py LIGHTS.zip OUT.npz OUT_META.json
"""
from __future__ import annotations

import json
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

LIGHTS_DOI = "doi:10.7910/DVN/YGIVCD"
WORLDPOP_IND = "https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/2020/IND/ind_ppp_2020_1km_Aggregated_UNadj.tif"
GEOBOUNDARIES_ADM1 = "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/"
URBAN_SHARE_2020 = 0.35  # UN World Urbanization Prospects 2018: India 34.9% urban in 2020 (WorldPop reference year)
INDIA_BOUNDS = (67.5, 6.0, 98.0, 37.5)
ZOOM = 14
# Share of a person's wealth rank carried by their tile. With Meta's index it was assumed 0.6 (0.4-0.8); night lights agree with
# that index at a rank correlation of 0.70 in urban India, so the loading shrinks by that factor: 0.6 x 0.70 = 0.42.
LOADING = (0.42, 0.28, 0.56)
UA = {"User-Agent": "StrataIQ-data-pipeline"}


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r:
        return r.read()


def tile_sums(path: str, bounds: tuple | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Sum of a raster's positive pixels in each zoom-14 tile (a pixel belongs to the tile holding its centre): keys, sums, pixel counts."""
    import rasterio
    from rasterio.windows import from_bounds

    with rasterio.open(path) as ds:
        win = from_bounds(*bounds, ds.transform) if bounds else None
        a = ds.read(1, window=win).astype(np.float64)
        tr = ds.window_transform(win) if win else ds.transform
        if ds.nodata is not None:
            a[a == ds.nodata] = 0.0
    a[(a < 0) | ~np.isfinite(a)] = 0.0
    rr, cc = np.nonzero(a > 0)
    n = 2 ** ZOOM
    px = np.floor((tr.c + (cc + 0.5) * tr.a + 180.0) / 360.0 * n).astype(np.int64)
    py = np.floor((1 - np.arcsinh(np.tan(np.radians(tr.f + (rr + 0.5) * tr.e))) / np.pi) / 2 * n).astype(np.int64)
    keys, inv = np.unique(px * n + py, return_inverse=True)
    return keys, np.bincount(inv, weights=a[rr, cc]), np.bincount(inv)


def weighted_rank(value: np.ndarray, tie: np.ndarray, pop: np.ndarray) -> np.ndarray:
    """Mid-rank percentile of ``value`` weighted by ``pop``; ``tie`` orders equal values (many dark tiles share radiance 0)."""
    o = np.lexsort((tie, value))
    c = np.cumsum(pop[o])
    out = np.empty(value.size)
    out[o] = (c - pop[o] / 2) / c[-1]
    return out


def main(lights_zip: str, out_npz: str, out_meta: str) -> None:
    import shapely

    n = 2 ** ZOOM
    tif = next(i.filename for i in zipfile.ZipFile(lights_zip).infolist() if i.filename.lower().endswith(".tif"))
    lkey, lsum, lpix = tile_sums(f"/vsizip/{Path(lights_zip).resolve().as_posix()}/{tif}", INDIA_BOUNDS)
    pop_file = Path(out_npz).with_suffix(".worldpop.tif")
    pop_file.write_bytes(fetch(WORLDPOP_IND))
    try:
        key, pop, _ = tile_sums(str(pop_file))  # every tile with residents in WorldPop's India raster
    finally:
        pop_file.unlink()
    i = np.clip(np.searchsorted(lkey, key), 0, len(lkey) - 1)
    hit = lkey[i] == key
    # mean radiance over the tile: lit pixels' sum / pixels a tile holds at this latitude (dark pixels count as 0)
    xs, ys = key // n, key % n
    clon = (xs + 0.5) / n * 360.0 - 180.0
    clat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (ys + 0.5) / n))))
    side = 40075.016 / n * np.cos(np.radians(clat))  # km
    pix_per_tile = np.maximum(lpix.max(), 1) * np.cos(np.radians(clat)) / np.cos(np.radians(clat)).max()
    light = np.where(hit, lsum[i], 0.0) / pix_per_tile
    dens = pop / (side * side)
    pct = weighted_rank(light, dens, pop)

    gb = json.loads(fetch(GEOBOUNDARIES_ADM1))
    states = json.loads(fetch(gb.get("simplifiedGeometryGeoJSON") or gb["gjDownloadURL"]))
    names = [f["properties"].get("shapeName") for f in states["features"]]
    polys = [shapely.geometry.shape(f["geometry"]) for f in states["features"]]
    state_idx = np.full(key.size, 255, np.uint8)
    for k, geom in enumerate(polys):
        shapely.prepare(geom)
        state_idx[(state_idx == 255) & shapely.contains_xy(geom, clon, clat)] = k
    miss = np.nonzero(state_idx == 255)[0]  # centre just outside every polygon (coast, border): nearest state
    if miss.size:
        state_idx[miss] = shapely.STRtree(polys).nearest(shapely.points(clon[miss], clat[miss])).astype(np.uint8)
    # urban/rural: one national density threshold, chosen so the urban population share matches the UN estimate
    o = np.argsort(-dens)
    d_star = float(dens[o][np.searchsorted(np.cumsum(pop[o]) / pop.sum(), URBAN_SHARE_2020)])
    urban = dens >= d_star
    pct_ss = np.zeros_like(pct)
    for k in np.unique(state_idx):
        for u in (False, True):
            m = np.nonzero((state_idx == k) & (urban == u))[0]
            if m.size:
                pct_ss[m] = weighted_rank(light[m], dens[m], pop[m])

    np.savez_compressed(out_npz, zoom=np.int64(ZOOM), tx=xs.astype(np.uint32), ty=ys.astype(np.uint32), light=light.astype(np.float32),
                        pop=pop.astype(np.float32), pct=pct.astype(np.float32), state=state_idx, urban=urban, pct_ss=pct_ss.astype(np.float32))
    meta = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "index": {"source": "night_lights", "name": f"Night lights ({tif.rsplit('.', 1)[0]}, ~500 m) on 2.4 km tiles x WorldPop 2020",
                  "dataset": "The global NPP-VIIRS-like nighttime light data (Version 2), Chen, Yu et al., Harvard Dataverse",
                  "url": "https://doi.org/10.7910/DVN/YGIVCD", "licence": "CC0 1.0", "source_updated": tif.rsplit(".", 1)[0][-4:],
                  "what": "Mean night-time radiance of the tile. A proxy for how well-off a neighbourhood is, not a measurement: it agrees with "
                          "Meta's Relative Wealth Index at a rank correlation of 0.70 across urban India and a median of 0.40 inside one city"},
        "loading": list(LOADING),
        "population": {"dataset": "WorldPop Global 1km UN-adjusted 2020, India", "url": WORLDPOP_IND, "licence": "CC BY 4.0"},
        "states": names, "states_source": {"dataset": "geoBoundaries IND ADM1 (gbOpen)", "url": GEOBOUNDARIES_ADM1, "licence": "CC BY 4.0"},
        "urban_rule": {"density_threshold_per_km2": round(d_star), "urban_population_share": URBAN_SHARE_2020,
                       "note": "Tiles at or above this WorldPop density are urban; threshold set so 35% of India's population is urban (UN WUP 2018, 2020)"},
        "zoom": ZOOM, "tiles": int(key.size), "tiles_lit": int((light > 0).sum()), "population_total": float(pop.sum()),
        "tile_km_at_equator": round(40075.016 / n, 3),
    }
    Path(out_meta).write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: v for k, v in meta.items() if k != "states"}, indent=2))
    if not (0.99 < pct.max() <= 1.0 and urban.any() and (light > 0).mean() > 0.3):
        raise SystemExit("sanity check failed")


if __name__ == "__main__":
    main(*sys.argv[1:4])
