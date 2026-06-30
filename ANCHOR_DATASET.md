# Anchor Dataset — NYC Restaurant Inspections (DOHMH)

> The real, messy public dataset DataReady is proven on. Also serves as the **ground-truth**
> for the north-star metric (issue precision).

## Source
- **Dataset:** DOHMH New York City Restaurant Inspection Results
- **Provider:** NYC Open Data (Socrata), resource id `43nn-pn8j`
- **Full download (all rows — use this for analysis/ground-truth):**
  ```
  curl -sSL "https://data.cityofnewyork.us/api/views/43nn-pn8j/rows.csv?accessType=DOWNLOAD" -o nyc_restaurant_full.csv
  ```
- **Shape:** 295,810 rows × 27 columns · 138 MB
- **Why this one:** real government operational data, English (US-reviewer legible), and it
  triggers all 6 scoring dimensions at once.
- **Note:** the 138 MB full file is for analysis only. The browser demo uses a smaller sample
  (a 150 MB CSV would blow up client-side parsing) — that's a product decision, not a limit.

## Documented mess → maps 1:1 to the 6 scoring dimensions
**Numbers below are from the FULL 295,810-row dataset (2026-06-30)** — i.e. real population
values, not a sample estimate.

| Dimension | Evidence found (full data) |
|---|---|
| **1. Completeness** | `grade` **50.7% missing** · `score` 5.8% missing · `grade_date` mostly missing |
| **2. Consistency** | `boro` mixes proper names with a stray `'0'` (370 rows) · `grade` has cryptic codes `N`, `Z`, `P` alongside `A/B/C` |
| **3. Schema clarity** | cryptic columns: `camis`, `bin`, `bbl`, `nta`, `critical_flag` — no human descriptions |
| **4. Validity** | `inspection_date == 01/01/1900` on **3,506 rows (1.2%)** = placeholder/fake date · `score` upper range suspicious |
| **5. PII / sensitivity** | `phone` populated on nearly every row · full street addresses |
| **6. Keys / uniqueness** | `camis` (restaurant id) is NOT unique — 31,159 unique of 295,810 (**avg 9.5 rows per restaurant**); one restaurant spans many inspection/violation rows, so no clean primary key |

## The headline stats (full data)
- **`grade` is missing on 50.7% of rows** — half the dataset has no inspection grade.
- **`camis` averages 9.5 rows per restaurant** — there is no clean primary key; naive
  row-counting will massively overcount restaurants.
- **3,506 rows (1.2%) carry a fake `01/01/1900` date** — small share, but silently breaks any
  time-series use.

## ⚠️ Lesson logged — why we went to the full dataset
The first **non-random 5,000-row sample badly misrepresented the population**:

| Metric | 5k sample (biased) | Full 295,810 (truth) | Error |
|---|---|---|---|
| `01/01/1900` dates | 17% | **1.2%** | **~14× overstated** |
| `score` missing | 21.2% | **5.8%** | ~3.6× overstated |
| `camis` rows/restaurant | 1.1 | **9.5** | wrong by ~9× |

Triangulation still held (grep == pandas == stdlib csv on every number), so the *computation*
was correct — but the *sample* lied about the population. **This is the case-study's strongest
chapter:** the tool (and the analyst) must never trust a sample's representativeness.

## How this becomes the metric
Hand-label the true issues above as ground truth, then measure DataReady's
precision/recall against it → that's the hard number for the case-study.
