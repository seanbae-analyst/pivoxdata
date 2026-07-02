# NYC Restaurant Inspections — an analysis memo

> The BA loop this product exists to serve, run once for real: **clean → analyze →
> findings → recommendation**, on the 295,810-row NYC DOHMH inspection dataset.
> Every number below is computed by [`run.mjs`](run.mjs) (deterministic, re-runnable);
> nothing is retyped. Step 1 of the pipeline is DataReady itself, dogfooded.

**Question:** where should inspection attention go, and what must anyone (human or AI)
know before computing anything from this file?

## Step 1 — clean first (DataReady, defaults)

Readiness 73 → 78. Mechanical fixes: cleared **3,506 placeholder dates** (1900-01-01),
removed **125 exact duplicate rows**, converted 60 sentinel tokens to real empties.
Refused, and reported as needing judgment: GRADE imputation, PHONE/BBL PII policy,
spelling unification in DBA/STREET/VIOLATION DESCRIPTION. The placeholders it cleared
and the duplicates it removed feed directly into findings 3 and 5.

## Findings

### 1 · The file is not what it looks like (granularity trap)
295,685 rows ≠ 295,685 inspections. One row = one *violation citation*:
**31,159 restaurants → 87,892 inspections → 295,685 rows (3.36 rows per inspection).**
Every naive `COUNT(*)` — "Manhattan had 109k inspections" — is violation-weighted and
~3.4× overstated. Any analysis (or AI prompt) that doesn't dedupe to the right entity
first inherits this on every metric.

### 2 · Averaging rows inflates the city's risk by 43%
SCORE is an inspection-level number repeated on every violation row, so bad
inspections (more rows) get counted more: row-weighted mean **25.48** vs
inspection-weighted mean **17.83** — a **+42.9%** bias (higher = worse in NYC).
In grade terms that's the difference between "the average inspection is a B" and
"the average inspection is borderline C". A dashboard, a pasted-into-ChatGPT summary,
or a fine-tuned model would all report the inflated number.

### 3 · The "missing grades" are mostly not a data-quality problem
Overall, GRADE is 50.7% missing — which looks like broken data. Segmented by
inspection type it's structural: **62% missing on initial cycle inspections vs 4% on
re-inspections** (99.9% on administrative records, which never carry grades). NYC
issues grades at specific points of the inspection cycle; the blanks are the process,
not corruption. **Imputing or dropping them would be the actual data-quality disaster** —
exactly why DataReady refuses imputation and reports it as a judgment.

### 4 · Risk is not where the volume is
At the correct granularity (score-bearing inspections, segments with ≥500/1,000):
- **Cuisines, worst avg score:** Indian 23.9 · Caribbean 21.5 · Chinese 21.1 ·
  Latin American 21.1 (92% of inspections had a critical violation) · Thai 20.8.
  Best: Donuts 11.0 · Hamburgers 12.2.
- **Boroughs:** Queens is the worst (19.1 avg, 88.8% critical) — not Manhattan (17.1),
  which has 1.6× Queens' inspection volume.
Inspection *volume* concentrates in Manhattan; inspection *risk* concentrates in Queens
and in a handful of cuisines.

### 5 · The placeholder dates were hiding a backlog
The 3,506 cleared 1900-01-01 dates all sit on rows with a blank inspection type:
**3,506 establishments (11.3% of all restaurants) recorded but never yet inspected** —
Manhattan 1,580, Brooklyn 853, Queens 698. A fake date wasn't just dirty data; it was
an un-inspected-restaurant queue stored where a date should be.

## Recommendations

1. **Reallocate, don't just add:** shift initial-inspection capacity toward Queens and
   the five worst cuisines, where per-inspection risk (avg score, critical rate) is
   highest — volume-based allocation currently over-serves Manhattan.
2. **Burn down the never-inspected queue** (3,506 establishments, 11.3%) as its own KPI;
   today it's invisible because it's encoded as a fake date instead of a status.
3. **Publish a reporting contract with the data:** entity keys (CAMIS, CAMIS+DATE),
   the grade-issuance rule, and "never average across violation rows." Findings 1–3 are
   silent 40–340% distortions waiting for every downstream analyst and every AI prompt.

## Limitations
Snapshot analysis (no trend claims); avg score is a proxy, not adjudicated risk;
cuisine labels are DOHMH's self-categorization; borough "0" rows (370) excluded from
segment tables; no statistical testing applied — gaps cited are large enough to be
decision-grade but not confidence-intervaled.

## Reproduce
```bash
node analysis/run.mjs   # writes findings.json; every number above comes from it
```
