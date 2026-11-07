"""Build backend/app/data/us_tracts_acs2023.npz from the Census Bureau's public bulk files (no API key).

Run by .github/workflows/us-data.yml: python backend/scripts/build_us_tracts.py <output.npz>
"""
from __future__ import annotations

import gzip
import io
import sys
import urllib.error
import urllib.request
import zipfile

import numpy as np

YEAR = 2023
ACS = f"https://www2.census.gov/programs-surveys/acs/summary_file/{YEAR}/table-based-SF/data/5YRData/acsdt5y{YEAR}-{{}}.dat"
GAZETTEER = f"https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{YEAR}_Gazetteer/{YEAR}_Gaz_tracts_national.zip"
LODES = "https://lehd.ces.census.gov/data/lodes/LODES8/{s}/wac/{s}_wac_S000_JT00_{y}.csv.gz"
STATES = "al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split()
TRACT, NATION = "1400000US", "0100000US"
MIN_HOUSEHOLDS = 30  # estimates for near-empty tracts are too noisy to describe a neighbourhood
# B01001 age bands, grouped into the app's 17 five-year bands (the last is 80+).
AGE_GROUPS = [[0], [1], [2], [3, 4], [5, 6, 7], [8], [9], [10], [11], [12], [13], [14, 15], [16, 17], [18], [19], [20], [21, 22]]
# B08301 commute modes in the order of genome.MODES: walk, motorcycle, car, taxi, bus, rail, bicycle.
MODE_COLUMNS = [["B08301_E019"], ["B08301_E017"], ["B08301_E002"], ["B08301_E016"], ["B08301_E011"], ["B08301_E012", "B08301_E013", "B08301_E014"], ["B08301_E018"]]


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


def tract_jobs(text: str) -> dict[str, int]:
    """Jobs located in each tract, from a LODES workplace file of census blocks (the tract is a block's first 11 digits)."""
    lines = iter(text.splitlines())
    header = next(lines).split(",")
    block, jobs = header.index("w_geocode"), header.index("C000")
    out: dict[str, int] = {}
    for line in lines:
        c = line.split(",")
        out[c[block][:11]] = out.get(c[block][:11], 0) + int(c[jobs])
    return out


def fetch_jobs() -> dict[str, int]:
    out: dict[str, int] = {}
    for state in STATES:
        for year in (2022, 2021, 2020, 2019):  # states publish on different schedules, and a few are missing
            try:
                out.update(tract_jobs(gzip.decompress(fetch(LODES.format(s=state, y=year))).decode()))
                break
            except urllib.error.HTTPError:
                continue
    return out


def group_age_sex(row: list[float]) -> list[float]:
    """46 B01001 values (23 male, then 23 female) to 17 male then 17 female five-year bands."""
    return [sum(row[offset + i] for i in g) for offset in (0, 23) for g in AGE_GROUPS]


def assemble(income: dict, size: dict, places: dict, people: dict | None = None) -> dict:
    """``people`` adds real demographics: age_sex, commute, employment and school tables by GEO_ID."""
    ids, lat, lng, counts, hh = [], [], [], [], []
    age_sex, modes, employed, college, jobs = [], [], [], [], []
    for geo, row in income.items():
        if not geo.startswith(TRACT) or geo not in size or sum(row) < MIN_HOUSEHOLDS or size[geo][0] <= 0:
            continue
        place = places.get(geo.removeprefix(TRACT))
        if people is not None and any(geo not in people[k] for k in ("age_sex", "modes", "employment", "school")):
            continue
        if place:
            ids.append(geo.removeprefix(TRACT))
            lat.append(place[0])
            lng.append(place[1])
            counts.append(row)
            hh.append(size[geo][0])
            if people is not None:
                age_sex.append(group_age_sex(people["age_sex"][geo]))
                modes.append(people["modes"][geo])
                employed.append(people["employment"][geo][0])
                college.append(sum(people["school"][geo]))
                jobs.append(people["jobs"].get(geo.removeprefix(TRACT), 0))
    assert income.get(NATION) and size.get(NATION), "national row missing"
    extra = {} if people is None else {"age_sex": np.array(age_sex, np.int32), "modes": np.array(modes, np.int32),
                                       "employed": np.array(employed, np.int32), "college": np.array(college, np.int32), "jobs": np.array(jobs, np.int32)}
    return {**extra, "id": np.array(ids), "lat": np.array(lat, np.float32), "lng": np.array(lng, np.float32),
            "counts": np.array(counts, np.int32), "hh_size": np.array(hh, np.float32),
            "nation_counts": np.array(income[NATION], np.int64), "nation_hh_size": np.float32(size[NATION][0]), "year": np.int32(YEAR)}


def combine_modes(row: dict[str, float]) -> list[float]:
    return [sum(row[c] for c in group) for group in MODE_COLUMNS]


def main(path: str) -> None:
    table = lambda name, cols: parse_acs(fetch(ACS.format(name)).decode(), cols)  # noqa: E731
    income = table("b19001", [f"B19001_E{i:03d}" for i in range(2, 18)])
    size = table("b25010", ["B25010_E001"])
    flat = [c for group in MODE_COLUMNS for c in group]
    people = {
        "age_sex": table("b01001", [f"B01001_E{i:03d}" for i in [*range(3, 26), *range(27, 50)]]),
        "modes": {g: combine_modes(dict(zip(flat, v))) for g, v in table("b08301", flat).items()},
        "employment": table("b23025", ["B23025_E004"]),
        "school": table("b14001", ["B14001_E008", "B14001_E009"]),
        "jobs": fetch_jobs(),
    }
    archive = zipfile.ZipFile(io.BytesIO(fetch(GAZETTEER)))
    places = parse_gazetteer(archive.read(archive.namelist()[0]).decode("latin-1"))
    data = assemble(income, size, places, people)
    assert len(data["id"]) > 70_000, f"only {len(data['id'])} tracts: the source format may have changed"
    assert data["jobs"].sum() > 100_000_000, f"only {data['jobs'].sum()} jobs: the LODES files may have changed"
    np.savez_compressed(path, **data)
    print(f"{len(data['id'])} tracts written to {path}")


if __name__ == "__main__":
    main(sys.argv[1])
