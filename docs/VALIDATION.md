# Validation against real data

`backend/scripts/validate_market_size.py` tests one specific thing: can the model tell how big a local market is?

- **Prediction:** residents multiplied by an income effect, from ACS 2023 tract data.
- **Truth:** annual industry payroll by county, from Census County Business Patterns 2022. The model never sees it at run time.
- **Method:** half the counties fit one scale factor and the income elasticity; the other half are scored. Counties under 20,000 people are left out. Payroll is a proxy for spending.

## Held-out results

| Business | Counties | Population only: median error | Fitted income model: median error | Fitted model: log R² | Fitted elasticity |
|---|---:|---:|---:|---:|---:|
| Full-service restaurant | 1,810 | 69% | 32% | 0.891 | 3.00 |
| Dentist | 1,741 | 42% | 28% | 0.889 | 1.70 |
| Grocery | 1,716 | 35% | 26% | 0.888 | 1.65 |
| Pharmacy | 1,637 | 28% | 29% | 0.860 | -0.40 |
| Beauty salon | 1,479 | 81% | 40% | 0.800 | 3.00 |
| Coffee shop | 1,583 | 88% | 43% | 0.787 | 3.00 |
| Gym | 1,260 | 73% | 43% | 0.760 | 2.80 |
| Clothing store | 937 | 54% | 40% | 0.747 | 1.20 |
| Barber | 428 | 60% | 57% | 0.486 | 1.15 |

Three fitted values sit at the top of the search range, so their true value may be higher.

## What this does not show

- It scores county market size, not one store's revenue. Revenue at a single site has not been tested against real results.
- High elasticities also capture what comes with wealthy counties, such as visitors and commuters, so they are not a pure income effect.
- Payroll is not sales, and businesses with no employees are not counted.
- The relationship is used inside a tract with limits, because it was fitted across whole counties.

The next test needs real outcomes: SBA loan results by location, or revenue from real owners.
