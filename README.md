# DataReady — is your data AI-ready?

**▶ Live demo: [pivoxdata.vercel.app](https://pivoxdata.vercel.app)** — drag a CSV onto the page.

Drop a CSV or Excel file, get a **0–100 AI-readiness score** with prioritized, plain-language
fixes — so a non-coder can tell whether a dataset is good enough for AI/analytics *before*
wasting a day on it. Runs entirely in the browser; nothing is uploaded.

> A product-thinking portfolio piece by **Sanghyun Bae**. The full 1-page PRD is in
> [`PRD.md`](PRD.md); the trust model is in [`TRUST.md`](TRUST.md).

---

## Run it

```bash
npm install
npm run dev          # → http://localhost:8099  (drag a CSV/XLSX onto the page)
```

The app uses native ES modules, so it must be served over HTTP — opening `index.html`
directly as a `file://` will not load the scorer. `npm run dev` is the one step that matters.

```bash
npm run score test-data/customers_messy.csv   # same scorer, from the terminal
npm run validate                              # precision/recall + oracle agreement gate
```

Deploy: static site, zero build step — `vercel deploy` (config in [`vercel.json`](vercel.json)).

---

## What it does

CSV/XLSX in → score across dimensions → a ranked, plain-language issue list, each tagged as a
**verifiable fact** with its raw evidence. v1 scores three deterministic dimensions
(no AI, fully reproducible):

| Dimension | Catches |
|---|---|
| **Completeness** | empty columns, high-missing columns, sentinel values (`N/A`, `NULL`, `-`) |
| **Consistency** | mixed date formats, placeholder dates (`1900-01-01`), numeric/text mixing, duplicate rows |
| **PII** | email / phone / SSN-shaped columns → governance flag |

Scores are **judgments built on facts** — the facts underneath are always inspectable, and the
dimension weights are explicit and tunable. (See `TRUST.md` for why that separation matters.)

### …and it closes the loop: score → clean → download (v1.1)

Detection without remediation is half a product. The **"Clean it"** button (and
`npm run score file.csv -- --fix`, or `node cli.mjs file.csv --fix`) applies every fix that is
*mechanically unambiguous* — dedupe exact rows, normalize mixed dates to ISO 8601, convert
sentinel tokens to real empties, clear placeholder dates, drop 100%-empty columns — then
re-scores the cleaned data and hands you the CSV. On the bundled CRM sample that's **79 → 95**.

What it deliberately does **not** do is guess: imputing missing values, coercing `"thirty"` → 30,
and PII masking policy are *judgments*, so [`fixer.mjs`](fixer.mjs) reports them as
"left alone — needs human judgment" instead of silently altering data. Same fact-vs-judgment
line as the scorer, enforced by the validation gate (`npm run validate`, section 3).

---

## Trust: don't trust, verify

The whole product is "is this data trustworthy?", so its own numbers have to be trustworthy
first. Every headline number about the anchor dataset is recomputed by **three independent
engines** — pandas, Python stdlib `csv`, and raw `grep` — and they must agree or `verify.py`
exits non-zero.

```bash
python -m venv venv && ./venv/bin/pip install pandas
./venv/bin/python verify.py        # ALL ENGINES AGREE ✓ → writes verified_facts.json
```

The app's own scorer then joins as a fourth engine: `npm run validate` checks the JS scorer's
computed facts against `verify.py`'s oracle on the same file. They match. No number in the
case-study is believed because one tool said so.

---

## North-star metric — issue precision

> **Issue precision** = % of flagged issues a user would confirm as real.

Measured against a **hand-labeled ground truth** ([`test-data/GROUND_TRUTH.md`](test-data/GROUND_TRUTH.md)):
a customers dataset with a schema the scorer has never seen and 9 deliberately planted defects.
Current result: **recall 9/9 (100%), precision 100%** — every planted defect caught, nothing
invented.

### A precision bug, found and fixed

Early PII detection used a loose "lots of digits" regex for phone numbers. On the real NYC
dataset that misfired badly — `camis` (restaurant id), `bin`/`bbl` (building ids), and
`latitude`/`longitude` all got flagged as "phone PII." Five false positives on one screen is
exactly what destroys trust in a single-score product.

The fix scores phone by **shape**, not digit-count alone: a decimal point means a coordinate
(never a phone); a bare digit run must be 10–11 digits (kills the 8-digit `camis`, 7-digit
`bin`); formatted numbers allow 10–15 (US + international). False positives dropped from five to
one, while the real `phone` column stayed flagged.

**Honest residual:** NYC's `bbl` is a bare 10-digit municipal id — indistinguishable from a bare
10-digit phone by *shape alone*. Separating them needs column-name semantics, which is deferred
to the v1.5 Claude layer. It's documented in the code and here, not hidden — that's the point of
the trust model.

### Stress-tested at scale — `npm run simulate`

Beyond the hand-labeled set, a seeded simulation harness ([`sim.mjs`](sim.mjs)) runs the scorer
against **20,000 procedurally-generated datasets** with known planted defects, plus an edge-case
battery and a PII trap battery. Latest run ([`SIMULATION.md`](SIMULATION.md)):

| | result |
|---|---|
| Monte Carlo (20,000 datasets, 83,835 defects) | **recall 100% · precision 100% · 0 crashes** |
| Edge cases (0 rows, all-empty, unicode, emoji, 60 cols…) | **16/16 survive, sane output** |
| PII traps (ids, zips, years, coords, prices…) | **0 false positives, 1 documented residual (`bbl`)** |
| Throughput | **~260,000 rows/sec** (100k rows in ~390 ms) |

Deterministic (seeded), so the numbers reproduce exactly: `node sim.mjs <seed> <N> --report`.

---

## Anchor dataset

NYC DOHMH Restaurant Inspections — 295,810 rows × 27 cols of real, messy government data that
triggers every dimension at once. Details and the re-download command are in
[`ANCHOR_DATASET.md`](ANCHOR_DATASET.md). The 138 MB full file is git-ignored (re-download to
reproduce `verify.py`); the 2.5 MB sample is committed so the demo and CLI work out of the box.

---

## Layout

```
index.html        the browser demo (drag-drop → score)
scorer.mjs        the deterministic scorer — pure function, runs identically in browser + Node
parse.mjs         CSV/XLSX → rows (Node CLI)
cli.mjs           score any file from the terminal
serve.mjs         zero-dependency static server (npm run dev)
validate.mjs      precision/recall + oracle-agreement gate
verify.py         3-engine triangulation harness → verified_facts.json
PRD.md TRUST.md ANCHOR_DATASET.md   the product thinking
```
