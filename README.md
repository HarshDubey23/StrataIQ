<div align="center">

# StrataIQ

**Test the street. Know if your shop will work, before you sign the lease.**

An AI-powered geospatial market simulator: describe any local business, pick any place in India, and watch
10,000 synthetic customers — each with a 615-parameter genome grounded in official data — choose between you,
your real competitors, and not buying at all.

[**Live demo**](https://strataiq-app.centralindia.cloudapp.azure.com) · [Methodology](docs/MODEL.md) · [Data sources](docs/DATA_SOURCES.md) · [Architecture](docs/ARCHITECTURE.md) · [Demo script](docs/DEMO.md) · [Product film](https://drive.google.com/file/d/1NvFSsfhI7kDLHTHAPqO7GH-YF3f3Uqm7/view?usp=sharing)

![StrataIQ landing page](docs/screenshots/landing.jpg)

</div>

> Model outputs are estimates under stated assumptions — not predictions, guarantees or financial advice.
> Every number on screen is labelled as **observed**, **official aggregate**, **derived**, **assumed** or **simulated**.

## The problem

Small entrepreneurs bet their savings on a location with almost no evidence. A map shows *some* competitors, a
spreadsheet shows margins, a chatbot gives generic advice — none of them explains how **location, affordability,
competition and price interact** for the people who actually live around the shop. StrataIQ connects all four in one
workflow and is honest about what it doesn't know.

## How it works

| 1. Define | 2. Discover | 3. Simulate | 4. Decide |
|---|---|---|---|
| Any business in plain words ("gym", "pizza shop", "dental clinic") with price, capacity and costs | Live competitors, buildings, roads and population for any searched place | 10,000 synthetic agents choose with a calibrated logit model; Monte Carlo for risk | Ranked scenarios, break-even, P(loss), what to verify next |

## Screenshots

### Live market — 10,000 agents at real population density
Every red dot is a synthetic customer placed on real WorldPop density. Press play: awareness spreads and agents travel to you or to real OpenStreetMap competitors.

![Live market simulation](docs/screenshots/live-agents.jpg)

### Agent X-ray — why *this* customer chose a competitor
Click any agent to see its genome, the utility of each option split into channels, and the exact parameters that cost you the sale.

![Agent X-ray](docs/screenshots/agent-xray.jpg)

<table>
<tr>
<td width="50%"><b>Simulation Lab</b> — change price, marketing, hours or capacity and rerun the real engine<br><img src="docs/screenshots/simulation-lab.jpg" alt="Simulation lab"></td>
<td width="50%"><b>Sensitivity</b> — tornado of the assumptions your profit actually depends on<br><img src="docs/screenshots/sensitivity.jpg" alt="Sensitivity analysis"></td>
</tr>
<tr>
<td><b>Market DNA</b> — agents × 615 parameters, and what separates your customers from your competitors'<br><img src="docs/screenshots/market-dna.jpg" alt="Market DNA"></td>
<td><b>Factor Intelligence Engine</b> — 615 factors across 10 domains, each tagged with where its value comes from<br><img src="docs/screenshots/factor-engine.jpg" alt="Factor engine"></td>
</tr>
<tr>
<td><b>Live competitors</b> — real businesses with observed vs unknown fields and provenance<br><img src="docs/screenshots/live-competitors.jpg" alt="Live competitors"></td>
<td><b>Decisions</b> — verdict, recommendations, and "what could make this result wrong?"<br><img src="docs/screenshots/decisions.jpg" alt="Decisions page"></td>
</tr>
<tr>
<td><b>New analysis</b> — any searchable place, radius or travel-time catchment<br><img src="docs/screenshots/wizard-location.jpg" alt="Location step"></td>
<td><b>Feasibility report</b> — shareable, with sources, assumptions and limits<br><img src="docs/screenshots/report.jpg" alt="Report"></td>
</tr>
</table>

## What makes it different

- **Real spending power, not guesses.** Each agent's monthly spend comes from MoSPI **HCES 2023-24** consumption deciles for its state × rural/urban. The state and rural/urban mix drives willingness to pay and participation. ([details](docs/research/REAL_DATA_SOURCES.md))
- **Real road distance.** Every population zone is routed to the site and competitors over OpenStreetMap roads (OSRM). If routing fails, the run says so and falls back to straight-line × circuity.
- **615-parameter Agent Genome.** 16 correlated latent traits conditioned on age and income, 46 real-geometry measurements and 553 generated parameters — every one consumed by the model and audited in tests. ([GENOME.md](docs/GENOME.md))
- **A defensible model.** Vectorised multinomial logit with an outside option (Huff gravity is a special case), lognormal affordability by segment, distance decay, marketing awareness, capacity limits, seeded Monte Carlo → P10/P50/P90 profit and P(loss). ([MODEL.md](docs/MODEL.md))
- **Honest about gaps.** Unknown competitor prices stay unknown. Add a competitor you saw on the street, rerun, and see the delta. When data is missing, **field research** sends a mobile survey to someone on the ground; answers flow straight back into the agents.
- **Voice analyst in Hinglish.** Press **V** anywhere and run the whole app by talking — it navigates, changes the plan and runs the real engine. It never speaks a number that isn't in the project facts or a model run.
- **LLM never makes numbers.** All money and demand figures come from the tested Python engine; AI text containing a number not present in the model output is discarded.

## Architecture

```
Browser ── Next.js 15 (frontend/) ── /api/* proxy ──► FastAPI (backend/)
                                                      ├─ engine/      choice model, ABM, population synthesis, finance,
                                                      │               Monte Carlo, sensitivity, recommendations, field research
                                                      ├─ factors/     615-factor intelligence engine with evidence mapping
                                                      ├─ categories/  open business taxonomy and resolver
                                                      ├─ providers/   Nominatim, Overpass, Foursquare, WorldPop, OSRM/openrouteservice
                                                      ├─ data/        HCES 2023-24 tables
                                                      └─ PostgreSQL + PostGIS (geography columns, GIST indexes)
```

**Stack:** Next.js 15, React 19, TypeScript, Tailwind 4, MapLibre GL + deck.gl (3D) · FastAPI, NumPy/SciPy, SQLAlchemy, Alembic · PostgreSQL + PostGIS · Playwright e2e · GitHub Actions CI.

## Run locally

```bash
cp .env.example .env          # all keys optional
docker compose up --build     # PostGIS + API + web
open http://localhost:3000
```

<details>
<summary>Without Docker (dev servers)</summary>

```bash
docker compose up -d db

cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql://strataiq:strataiq@localhost:5432/strataiq
alembic upgrade head
uvicorn app.main:app --reload             # http://localhost:8000/docs

cd ../frontend
npm install
API_URL=http://localhost:8000 npm run dev  # http://localhost:3000
```
</details>

## Tests

```bash
cd backend
pytest                        # engine, providers, genome, factors, API (with PostGIS)
RUN_LIVE=1 pytest -m live -s  # real OpenStreetMap / WorldPop calls
```

CI runs lint, migrations up/down/up, the full test suite against PostGIS, a live-data job, a frontend typecheck +
production build, and a Playwright judge journey that captures the screenshots above.

## Deployment

The live app runs on Azure (Central India): https://strataiq-app.centralindia.cloudapp.azure.com.

It can also run on Render's free tier: `frontend/` as a Node web service (`npm start`, with `API_URL`
pointing at the API) and `backend/` as a Docker web service from `backend/Dockerfile`, which runs the Alembic
migrations on start. Postgres + PostGIS is a Neon project (Singapore). Free instances sleep after 15 idle minutes, so the
first visit after a quiet spell takes about a minute. Vercel still works too (`backend/` as a Python function with
`SERVERLESS=1`, `AUTO_MIGRATE=1`). Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` and optionally `CONTACT_EMAIL`,
`ORS_API_KEY`, `SPEKO_API_KEY` (voice) and an LLM key (see `.env.example`).

## Data and licences

Map data © OpenStreetMap contributors (ODbL) · Population © WorldPop, University of Southampton (CC BY 4.0) ·
Consumption © MoSPI HCES 2023-24 ·
State boundaries © geoBoundaries (CC BY 4.0) · Routing © OSRM / FOSSGIS, openrouteservice by HeiGIT ·
Tiles © OpenFreeMap / OpenMapTiles. OSM contributor usernames are discarded.

Code under the [MIT License](LICENSE).
