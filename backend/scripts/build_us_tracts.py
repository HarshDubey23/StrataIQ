"""Build backend/app/data/us_tracts_acs2023.npz from the Census Bureau's public bulk files (no API key).

Run by .github/workflows/us-data.yml: python backend/scripts/build_us_tracts.py <output.npz>
"""
from __future__ import annotations

import io
import sys
import urllib.request
import zipfile

import numpy as np

YEAR = 2023
ACS = f"https://www2.census.gov/programs-surveys/acs/summary_file/{YEAR}/table-based-SF/data/5YRData/acsdt5y{YEAR}-{{}}.dat"
GAZETTEER = f"https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{YEAR}_Gazetteer/{YEAR}_Gaz_tracts_national.zip"
TRACT, NATION = "1400000US", "0100000US"
MIN_HOUSEHOLDS = 30  # estimates for near-empty tracts are too noisy to describe a neighbourhood


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "StrataIQ data build"}), timeout=600) as r:
        return r.read()


def parse_acs(text: str, columns: list[str]) -> dict[str, list[float]]:
    """{GEO_ID: values} for the nation and every tract. A tract with a suppressed or non-numeric estimate is left out."""
    lines = iter(text.splitlines())
    header = next(lines).split("|")
    at = [header.index(c) for c in columns]
    out = {}
    for line in lines:
        if not line.startswith((TRACT, NATION)):
            continue
        cells = line.split("|")
        try:
            values = [float(cells[i]) for i in at]
        except (ValueError, IndexError):
            continue
        if min(values) >= 0:
            out[cells[0]] = values
    return out


def parse_gazetteer(text: str) -> dict[str, tuple[float, float]]:
    """{11-digit tract id: (lat, lng)} from the tab-separated gazetteer."""
    lines = iter(text.splitlines())
    header = [h.strip() for h in next(lines).split("\t")]
    g, la, ln = header.index("GEOID"), header.index("INTPTLAT"), header.index("INTPTLONG")
    out = {}
    for line in lines:
        c = line.split("\t")
        out[c[g].strip()] = (float(c[la]), float(c[ln]))
    return out


def assemble(income: dict, size: dict, places: dict) -> dict:
    ids, lat, lng, counts, hh = [], [], [], [], []
    for geo, row in income.items():
        if not geo.startswith(TRACT) or geo not in size or sum(row) < MIN_HOUSEHOLDS or size[geo][0] <= 0:
            continue
        place = places.get(geo.removeprefix(TRACT))
        if place:
            ids.append(geo.removeprefix(TRACT))
            lat.append(place[0])
            lng.append(place[1])
            counts.append(row)
            hh.append(size[geo][0])
    assert income.get(NATION) and size.get(NATION), "national row missing"
    return {"id": np.array(ids), "lat": np.array(lat, np.float32), "lng": np.array(lng, np.float32),
            "counts": np.array(counts, np.int32), "hh_size": np.array(hh, np.float32),
            "nation_counts": np.array(income[NATION], np.int64), "nation_hh_size": np.float32(size[NATION][0]), "year": np.int32(YEAR)}


def main(path: str) -> None:
    income = parse_acs(fetch(ACS.format("b19001")).decode(), [f"B19001_E{i:03d}" for i in range(2, 18)])
    size = parse_acs(fetch(ACS.format("b25010")).decode(), ["B25010_E001"])
    archive = zipfile.ZipFile(io.BytesIO(fetch(GAZETTEER)))
    places = parse_gazetteer(archive.read(archive.namelist()[0]).decode("latin-1"))
    data = assemble(income, size, places)
    assert len(data["id"]) > 70_000, f"only {len(data['id'])} tracts: the source format may have changed"
    np.savez_compressed(path, **data)
    print(f"{len(data['id'])} tracts written to {path}")


if __name__ == "__main__":
    main(sys.argv[1])
