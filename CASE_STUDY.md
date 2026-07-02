# Case study — DataReady

> How I scoped, built, verified, and shipped a data-readiness product in one build cycle —
> and what each decision was for.
> **Live:** [pivoxdata.vercel.app](https://pivoxdata.vercel.app) · **PRD:** [PRD.md](PRD.md) · **Trust model:** [TRUST.md](TRUST.md)

---

## 1 · The problem, and the wedge

Before any AI or analytics work, someone has to answer: **"is this data actually usable?"**
Today that check is tribal knowledge — every analyst eyeballs it with a private standard,
real issues slip through, and garbage-in-garbage-out surfaces only *after* the work is wasted.

Tools exist, but none serve the person who just received a CSV:

| Alternative | Why it doesn't serve them |
|---|---|
| ydata-profiling | exhaustive stats dump, for people who code, no verdict |
| Great Expectations / Soda | write-config validation frameworks, live inside eng pipelines |
| OpenRefine | manual cleaning, no scoring, no judgment |

**The wedge:** zero-setup, in-browser, one opinionated score + prioritized plain-language
fixes. No account, no upload (nothing leaves the browser), no code.

## 2 · The core design decision: facts vs. judgments

The product's entire trust story hangs on one line, drawn everywhere:

- A **FACT** is machine-verifiable: *"`grade` is missing on 149,869 of 295,810 rows (50.7%)."*
- A **JUDGMENT** interprets facts: *"that makes this dataset not AI-ready."*

The scorer only asserts facts (every issue row carries its raw evidence); the score is a
judgment with **explicit, tunable weights**. The fixer executes only mechanically-unambiguous
changes; anything requiring interpretation is **asked, or refused** — never guessed.
This one line ended up shaping the scorer, the trust harness, the simulation design, and the
fix UX.

## 3 · Trust harness: don't trust, verify

A tool whose pitch is "is your data trustworthy?" cannot have unverified numbers of its own.
Every headline stat about the anchor dataset (NYC restaurant inspections, 295,810 rows) is
recomputed by **three independent engines** — pandas, Python stdlib `csv`, raw `grep` — and
`verify.py` exits non-zero on any disagreement. The JS scorer then joins as a **fourth engine**:
`validate.mjs` checks its computed facts against the Python oracle on the same file. All match.

### The lesson that forced this structure

My first sample was the dataset's **first 5,000 rows**. It reported 17% fake placeholder
dates. The true population value is **1.2% — a 14× overstatement**, because early rows skew
toward legacy records. Triangulation had passed — the *math* was right; the *sample* lied.
Trust requires **both** correct computation and honest sampling. That incident is documented,
not hidden, and it is why the ground-truth stats come from the full file.

## 4 · North-star metric, measured before having users

**Issue precision** — the % of flagged issues a user would confirm as real. Proxy-measured
against a hand-labeled ground truth: a customers dataset with a schema the scorer had never
seen and 9 deliberately planted defects. Result: **recall 9/9, precision 100%**.

Then scaled far beyond the hand-labeled set with a seeded Monte Carlo harness (`sim.mjs`):
**20,000 procedurally-generated datasets, 83,835 planted defects → recall 100%, precision
100%, 0 crashes**, stable across 6 independent seeds (~73,000 datasets total), plus an
edge-case battery (0 rows, unicode, emoji, 60-column, 5,000-char values) and a PII trap
battery (ids, zips, years, coordinates, prices). Deterministic — anyone can reproduce the
exact numbers with `npm run simulate`.

## 5 · The bug that proved the metric matters

First run on real NYC data, the loose phone-PII regex flagged **five false positives on one
screen**: `camis` (restaurant id), `bin`/`bbl` (building ids), `latitude`, `longitude` — all
"looks like phone PII." For a single-score product, that's fatal: precision is the trust
currency.

The fix scores phone by **shape**, not digit count: a decimal point means coordinate, never
phone; bare digit runs must be 10–11 digits (kills the 8-digit `camis`, 7-digit `bin`);
formatted numbers allow 10–15. False positives went **5 → 1** while the real `phone` column
stayed caught, and the hand-labeled recall/precision stayed 100%.

**The honest residual:** `bbl` is a bare 10-digit municipal id — indistinguishable from a
bare 10-digit phone *by shape alone*. Resolving it needs column-name semantics, deferred to
the v1.5 Claude layer. It's documented in the code, the README, and here — because the trust
model demands the limits be as visible as the wins.

## 6 · Closing the loop: score → ask → clean → download

A score without remediation is a complaint, not a product. v1.1 added the fix layer with the
same fact/judgment line:

- **Mechanical (auto, but user-toggleable):** dedupe exact rows · unify mixed date formats ·
  clear placeholder dates · sentinel tokens → real empties · drop 100%-empty columns.
- **Judgment (asked, never guessed):** which date convention wins (ISO vs US)? what happens
  to PII (keep vs mask)? which spelling wins in a cluster like `Globex / GLOBEX` — pick one,
  **or type your own** canonical form?
- **Refused outright:** imputing missing values, coercing `"thirty"` → 30 — reported as
  *"left alone — needs human judgment."*

On the bundled CRM sample the loop reads **79 → 95**, and the cleaned CSV re-scores to the
same number from disk — the delta is itself a verifiable claim. The spelling-cluster detector
also surfaced real findings in NYC data (`DUNKIN` vs `DUNKIN'`, `ROOSEVELT AVENUE` vs
`Roosevelt Avenue`) — the same duplicate-entity problem that plagues every operational
dataset.

## 7 · Results

| Claim | Evidence |
|---|---|
| Deterministic scorer, browser + Node, same module | `scorer.mjs`, no build step |
| Facts triangulated by 3 engines + JS as 4th | `verify.py`, `verified_facts.json`, `validate.mjs` §2 |
| Recall 100% / precision 100% at scale | `SIMULATION.md` — 20k datasets, 99,045 defects, 0 crashes |
| Ground-truth measured north-star | `test-data/GROUND_TRUTH.md` — 10/10 recall, 100% precision |
| Fix loop with ask-don't-guess UX | live demo, `fixer.mjs`, `validate.mjs` §3–4 |
| ~150,000 rows/sec scoring throughput | 100k rows ≈ 660 ms |
| Shipped | [pivoxdata.vercel.app](https://pivoxdata.vercel.app), zero-dependency static deploy |
| "So what" proven with a real LLM, transcripts committed | [`experiment/SO_WHAT.md`](experiment/SO_WHAT.md) |

### Scope expansion, on the same principle — duplicate IDs (Keys/uniqueness slice)

"Why only these issue types?" has a principled answer — *only what the machine can prove* —
and the PRD's Keys/uniqueness dimension had a provable slice waiting: a column that **names
itself an identifier** (`deal_id`, `dealId`, "Deal ID" — token-gated so `paid`/`valid` never
match) and is **≥90% unique** is treated as intending uniqueness; duplicated values in it are
a fact. The two-gate design keeps precision honest the same way the phone detector does:
reference columns with legitimate repeats (`customer_id` on an orders table) fall under the
gate and stay silent. Fixing stays a judgment — exact-copy dups clear via dedupe, differing
rows are reported to the human. Shipped as the 11th issue type with its own validation
section and Monte-Carlo defect class: still 100% recall / 100% precision at 20k datasets.

### The "so what" experiment — proving the score matters

A readiness score is only as good as its consequence, so we measured the consequence: the
same five analyst questions, asked of a real LLM, on the dirty sales-pipeline sample vs the
DataReady-cleaned version ([`experiment/SO_WHAT.md`](experiment/SO_WHAT.md), raw transcripts
committed). The cheap tier returned a pipeline total inflated by $18,500 and named the
1900-01-01 placeholder "the earliest close date." The frontier tier self-cleaned the 44-row
file — by silently improvising the exact judgment calls this tool makes explicit — and still
flipped its headline answer between two identical runs. On the cleaned file every model
answered correctly, directly, and identically; and 44 real emails stayed out of the prompt.
The experiment also surfaced the honest scale point: in-context self-cleaning is a small-file
luxury — the 295k-row anchor dataset doesn't fit in a context window at all.

### The analysis loop, closed — and productized

The tool's reason to exist is the analyst loop (clean → analyze → findings →
recommendation), so we ran that loop for real once: [`analysis/ANALYSIS.md`](analysis/ANALYSIS.md)
on the full 295k-row NYC dataset, with DataReady dogfooded as step 1. It produced
decision-grade findings (a 3.4× granularity trap; a +42.9% weighted-average bias; missing
grades that are process, not corruption; risk concentrated in Queens while volume sits in
Manhattan; 3,506 never-inspected restaurants hidden behind placeholder dates) and a
recommendation memo. Then each finding was generalized into a deterministic insight shape
([`insights.mjs`](insights.mjs)) that now runs on every uploaded file — manual analysis as
discovery, product as the generalization. The engine's first draft produced exactly the
auto-EDA trivia the category is infamous for (summed ZIP codes, "93% of X in the segment
with 93% of rows"); the shipped version encodes those failures as guards, and its
validation includes an honest-silence test.

## 8 · What I'd do next (and deliberately didn't)

- **v1.5 Claude layer** — phrase facts in plain language, suggest column descriptions,
  resolve the `bbl` collision and semantic unification (`sb` ↔ `Sanghyun`) with column-name
  semantics. Claude *phrases and proposes*; it never produces the score.
- **Real-user precision measurement** — the north-star is currently proxy-measured against
  ground truth; the real metric needs real users confirming/rejecting flags.
- **Deliberately out of scope:** multi-sheet Excel, joins, DB connectors, accounts — the
  wedge is the instant verdict, and everything that dilutes it waited.

## 9 · What this project demonstrates (the PM part)

1. **Wedge discipline** — found the gap between profiling dumps and eng frameworks, and
   refused features that diluted it.
2. **A north-star defined *and measured* pre-launch** — with a falsifiable harness, not a
   vanity claim.
3. **Data catching my own error** — the 14× sampling overstatement, caught by the process,
   documented as a feature of the trust model.
4. **Precision as the trust currency** — found the failure mode that kills single-score
   products, fixed it measurably (5→1), and documented the residual instead of hiding it.
5. **Product architecture from one principle** — fact vs. judgment drew every line: what the
   scorer asserts, what the fixer touches, what the UI asks, what the tool refuses to do.
