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

## How the results are used

US demand starts from real spending per person: industry payroll per resident from County Business Patterns, divided by an assumed labor share of sales. The fitted income effect then adjusts it for each neighborhood, within limits. Workers are added from Census LODES jobs data, each counted as an assumed 30% of a resident.

## What this does not show

- It scores county market size, not one store's revenue. See the single-store test below.
- High elasticities also capture what comes with wealthy counties, such as visitors and commuters, so they are not a pure income effect.
- Payroll is not sales, and businesses with no employees are not counted.
- The relationship is used inside a tract with limits, because it was fitted across whole counties.

## Single-store test: Texas

`backend/scripts/validate_site_sales.py` forecasts real Texas bars and restaurants and compares them with 12 months of mixed beverage gross receipts from the Texas Comptroller (October 2025 to September 2026). The engine saw only the location, Census tract data and nearby permit holders. One scale factor was set on half the cities, and every score below comes from the other half: 2,959 locations in 205 cities, out of 5,546 forecast.

| Forecast | Median error | Within 2x | Rank correlation | Log R² |
|---|---:|---:|---:|---:|
| StrataIQ | 85% | 32% | 0.15 | -0.44 |
| The same number for every venue | 75% | 35% | none | 0.00 |
| People per rival | 94% | 25% | -0.21 | -1.28 |

The model did not beat a single fixed number. It does sort broadly: its top quarter of sites sold a median of $33,939 a month and its bottom quarter $17,629. Inside a city that signal is weak and unreliable: rank correlation was 0.25 in Houston, 0.12 in Dallas, -0.11 in Austin and -0.12 in San Antonio.

Refitting did not rescue it. On the held-out cities, a calibrated model reached an R² of 0.006, and adding people and rivals reached 0.026. No parameters were changed, because a fit this weak would only learn noise.

Two findings to carry forward:

- Sales at the 90th percentile are about 50 times those at the 10th. Location data explains little of that spread, which comes from concept, size and operation.
- Sites with more rivals nearby sold more, not less (rank correlation 0.19 overall, 0.10 to 0.30 by city). The engine treats a rival mainly as lost share, so it misses the pull of a busy district.

Limits of this test: receipts cover alcohol only, permit holders mix bars, restaurants, hotels and venues, every forecast used the same price and quality, and it says nothing direct about other business types. A founder's own costs and plan are also not part of it.

What this means for the product: treat a single-store sales figure as a planning estimate, not a prediction. The next test needs revenue from real owners, or SBA loan results by location.
