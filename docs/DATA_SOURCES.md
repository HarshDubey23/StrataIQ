# Data sources and governance

All sources are described once in `backend/app/providers/registry.py`; the UI renders provenance from those records.

| Source | Used for | Access | Licence / attribution | Notes |
|---|---|---|---|---|
| OpenStreetMap via Overpass API | competitors, buildings, activity points | live, cached 12 h (buildings 3 d) | ODbL, “© OpenStreetMap contributors” | one request at a time, retries across public endpoints; contributor usernames/uids discarded; record last-edit time kept |
| Nominatim | place search, reverse geocode | live, throttled to 1 req/s, cached 14–30 d | ODbL | `User-Agent` includes `CONTACT_EMAIL` as the usage policy asks |
| WorldPop Global2 R2025A (100 m, API v3) | catchment population, age and sex | live, cached 60 d | CC BY 4.0 | modelled estimate for the current year (2015-2030 available, `WORLDPOP_YEAR` overrides); not a live count. Anonymous use is 1,000 requests a day; `WORLDPOP_API_KEY` raises it |
| openrouteservice | travel-time catchments | optional (`ORS_API_KEY`) | ORS terms; OSM ODbL | falls back to radius, recorded as a snapshot error |
| OpenFreeMap tiles | base map, 3D buildings where heights exist | browser | © OpenMapTiles, OSM | falls back to the positron style |
| Night lights (NPP-VIIRS-like V2, Harvard Dataverse) | which neighbourhoods are better off (India) | built into `app/data/wealth_grid_ind.npz` by `scripts/build_wealth_grid.py` | CC0 1.0 | a proxy, not a measurement; see docs/VALIDATION.md. Replaces Meta's Relative Wealth Index (CC BY-NC) |
| User input | prices, costs, competitors, actual outcomes | — | owned by the user | labelled user-entered, never “verified” |
| AI provider | optional category mapping and explanation text | optional (`AI_API_KEY`) | — | never produces numbers |

**Surroundings.** The same OpenStreetMap request also returns 64 kinds of places around the site (`SURROUNDINGS` in
`backend/app/categories/taxonomy.py`): what brings people, how they arrive, food and shops, daily needs, water and green, and things
to look at before signing (open drains, level crossings, liquor shops, landfill, cantonment land). The Market screen lists them under
**Around** with counts and the nearest one. For food, retail and lodging, the kinds in `ACTIVITY_KINDS` each add an assumed 120
resident-equivalents of demand; that weight is an assumption, not a fitted value. Everything else is shown, not modelled.

**Timestamps.** Each provenance record stores `retrieved_at` (when StrataIQ fetched it) and `source_updated_at` (OSM database
timestamp / record edit time / WorldPop reference year). The UI always shows both.

**Failures.** If a provider fails, the snapshot is saved with status `partial`/`failed` and an `errors` list; nothing is
fabricated. Without population, simulation is blocked until data loads or the user enters a population (labelled user).

**Coverage indicator.** Computed from mapped buildings per 1,000 residents, competitor-record completeness and edit recency.
It is a heuristic, not a measured recall rate.

**Privacy.** No personal data about individuals is collected. Synthetic agents are generated from aggregate zone weights.
