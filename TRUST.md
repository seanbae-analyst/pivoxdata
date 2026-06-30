# TRUST.md — Why you can believe DataReady's numbers

> The whole product is "is this data trustworthy?" — so the product's *own* numbers have to
> be trustworthy first. This is the structure that makes trust mechanical, not rhetorical.

## Principle: don't trust, verify
No number is believed because a tool (or a person, or an AI) said so. A number is believed
because **independent methods produce it identically.** If they diverge, we stop and resolve
it before shipping the claim.

## The 4 pillars

### 1. Triangulation harness — `verify.py`
Every headline number is recomputed by **two independent engines** (pandas vs. Python stdlib
`csv`) plus a **third raw `grep`** cross-check on the killer stat. Disagreement → the script
exits non-zero (CI gate). One engine's bug or one human's slip cannot survive, because the
other engines would not reproduce it.

```
python verify.py                 # runs on nyc_restaurant_full.csv
# ALL ENGINES AGREE ✓  -> exit 0
# DISAGREEMENT ✗        -> exit 1  (never ship the number)
```

Current run: pandas == stdlib_csv == grep on all 6 claims (295,810 rows). ✓

### 2. Fact vs. Judgment — kept separate, always
Triangulation proves a **fact**, never a **judgment**.

| | Example | Established by |
|---|---|---|
| **FACT** | "149,869 rows (50.7%) have no `grade`" | triangulation (machine) |
| **JUDGMENT** | "missing `grade` makes this not AI-ready" | human + domain (you) |

DataReady will visibly label every claim as one or the other. Scores are judgments built on
facts — and the facts under them are always inspectable.

### 3. Provenance — every number is traceable
`verify.py` writes `verified_facts.json`: dataset id, exact download URL, file, row count, the
engines used, and each verified fact. Any number in the case-study or the app can point back
to its origin. No orphan statistics.

### 4. Ground-truth — how the tool's *quality* is measured
The north-star metric (issue precision/recall) is measured against a **hand-labeled** set of
the anchor dataset's real issues. The tool is graded against human-verified truth, not against
its own opinion.

## What this structure proves — and what it doesn't
- ✅ Proves: the computation behind a number is correct and reproducible.
- ❌ Does not prove: that the number *matters*, or that a value is *accurate vs. reality*
  (a well-formed phone number can still be the wrong number — see `PRD.md` scope-out of
  Accuracy/Timeliness).

## The lesson that forced this structure
Our first **non-random 5,000-row sample overstated the fake-date problem ~14×** (17% vs. the
true 1.2%). Triangulation still passed — the math was right — but the *sample* lied about the
population. Trust therefore requires **both**: correct computation (triangulation) **and**
honest sampling/provenance (full data + traceability). See `ANCHOR_DATASET.md`.

## Forward design: trusting the app's output too
Right now `verify.py` is the independent **oracle** for the dataset analysis. When the TS
scorer in the app exists, it joins as another engine: the app's reported numbers get checked
against the oracle on the same file, and must agree. Same principle, one layer up — the tool
is never its own judge.
