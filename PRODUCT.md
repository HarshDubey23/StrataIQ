# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a first-time US founder about to sign a commercial lease. They are not a data expert, they are spending their own savings, and they are checking one address, often at night on a laptop, sometimes on a phone. Their job is to decide whether to sign, renegotiate or walk away.

## Product Purpose

StrataIQ tests a business plan at a real address. It loads rivals, Census neighborhood data and travel routes, simulates customers, then shows break-even, a profit range and the assumptions to check first. Success means the founder understands what has to be true for this location to work, and acts on it.

## Positioning

StrataIQ puts 10,000 simulated customers, each drawn from Census data for their own tract, on the real streets around one address. Each has a budget, a routine and friends, and each chooses you, a rival or nothing over 84 days. The founder can watch this happen.

## Operating Context

Flow: describe the business and pick an address, load the market, simulate, compare price and marketing, read the verdict, buy the report. The free preview comes first, then a $29 per-location report. The report is read on screen and printed as a Letter PDF. Field data can be gathered by phone through a shared link.

## Capabilities and Constraints

- Next.js, Tailwind 4, Motion, MapLibre and deck.gl, with a FastAPI and PostGIS backend.
- US market. Prices in dollars, distances in miles. No Hindi anywhere in the US product.
- Voice assistant appears only inside the signed-in app.
- Single-store sales figures are planning estimates. See `docs/VALIDATION.md`: in a Texas test, location data explained under 3% of the difference between venues.
- Undecided: payment provider, final domain, final support email.

## Brand Commitments

- Name: StrataIQ. The in-app voice assistant is Strata.
- Must feel like a very trusted, professional US company. Lots of motion and 3D are welcome on public pages.
- The owner asked for blue combined with something better than all-blue.
- No Claude or Anthropic naming anywhere.

## Evidence on Hand

- Held-out county market-size results and the Texas single-store test, in `docs/VALIDATION.md`.
- A live sample report for a gym in South Austin, with example costs labelled as examples.
- No customers, testimonials, reviews, press or logos exist. None may be invented.

## Product Principles

- Every number shows where it came from: measured, entered by the founder, or estimated.
- Say what to do next, in plain words, before showing how it was computed.
- Sell the product strongly, and only with things that are true.
- A founder with no data background should never feel lost.
- The live simulation is the moment people remember, so it gets the most care.

## Accessibility & Inclusion

WCAG 2.1 AA as the working target. Reduced motion must keep all content visible.
