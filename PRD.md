# DataReady — 1-Page PRD

> Status: **Draft v0.1** · Owner: Sanghyun Bae · Last updated: 2026-06-30

## One-liner
Upload a dataset, get a **0–100 "AI-readiness" score** with prioritized, plain-language
fixes — so anyone can tell whether their data is good enough for AI/analytics *before*
they waste time on it.

## Problem
Before using data for AI or analytics, teams have to answer one question: **"Is this data
actually usable?"** Today that check is manual, slow, and inconsistent — every analyst
eyeballs it with their own private standard, real issues slip through, and
garbage-in-garbage-out only surfaces *after* the model or analysis work is already wasted.

## Why now
The rush to push data into LLMs and analytics has made **"AI-ready data / data quality for
AI"** a top enterprise concern in 2026 — but judging data quality is still tribal knowledge,
not a repeatable, explainable check.

## Alternatives — and why this is different
- **ydata-profiling / pandas-profiling** — generates an exhaustive *profiling dump* (stats,
  correlations, histograms). But it's a Python library for people who code, the output is
  overwhelming, and it never gives a verdict or a prioritized "what to fix."
- **Great Expectations / Soda** — powerful data-quality *validation frameworks*, but
  heavyweight: you write expectations/config, and they live inside engineering pipelines.
  Built for data engineers, not for a quick "upload and see."
- **OpenRefine** — manual, hands-on cleaning; no scoring, no judgment.

**The wedge:** a **zero-setup, opinionated single score + prioritized plain-language fixes,
framed as "is this AI-ready"** — for people who *don't* write code. Existing tools are either
code libraries or eng frameworks; none hand a non-expert an instant verdict plus next actions.

## Target user
- **Primary:** a data-handling junior analyst / ops person who receives a dataset and has to
  prep it for analysis or AI.
- **Secondary:** a PM or non-data stakeholder who needs a fast, trustworthy read on whether a
  dataset can be relied on.

## Job-to-be-done
> "When I get a new dataset, I want to know within minutes whether it's clean enough to use —
> and exactly what to fix — so I don't lose a day discovering problems downstream."

## Solution — runtime loop
CSV in → **score across 6 dimensions** → **ranked issue list** (each explained in plain
language) → **suggested fixes + a downloadable report / data-dictionary draft.**

### Scoring dimensions (each transparent — show the evidence, never a black box)
1. **Completeness** — missing values, empty columns
2. **Consistency** — mixed types/formats in a column (dates, units, casing), duplicate rows
3. **Schema clarity** — cryptic column names, no descriptions/types
4. **Validity** — out-of-range / impossible values, outliers
5. **PII / sensitivity** — emails, phones, ID-like fields → governance flag
6. **Keys / uniqueness** — duplicate IDs, no clear primary key

## North-star metric
**Issue precision** = % of flagged issues the user confirms as real.
- *How it's measured without live users:* hand-label a ground-truth set of the real issues in
  the anchor dataset, then compute the tool's precision/recall against it. (Shows rigor, and
  gives the case-study a hard number.)
- Guardrail: time-to-first-report (must stay low).
- Secondary: # datasets scored, # report downloads/shares.

## Scope
- **v1 (deterministic, no AI):** single **CSV or .xlsx** upload (first sheet, single-row
  header) · 3 dimensions (Completeness, Consistency, PII-regex) · one score + issue list + a
  clean report page · proven on the anchor dataset. **Scoring is mechanical code, not an AI's
  opinion** — so it's reproducible and verifiable by `verify.py` (see TRUST.md).
- **v1.5 (Claude layer):** plain-language explanations, standardized column-name +
  description suggestions, data-dictionary draft, remaining 3 dimensions. Claude only *phrases*
  facts the code already computed — it never produces the score.
- **Out of scope (v1):** messy Excel structures (multiple sheets, merged cells, multi-row
  headers), multi-file joins, live DB connectors, auto-fixing the data, accounts/auth.

## Anchor / demo dataset
A real, notoriously messy public dataset used to prove the tool and ground the case-study.
**Recommended:** NYC Open Data (restaurant inspections or 311 service requests) — genuinely
messy, English (US-reviewer legible), real government operational data.
*(Alt: data.go.kr Korean public data — adds a bilingual differentiator, costs translation effort.)*

## Risks / open questions
- Scoring weights are inherently subjective — how do we justify them?
- PII detection false positives.
- Will users *trust* a single score? → validate by measuring issue precision on the anchor set.

## Milestones
1. ~~Lock concept + PRD~~ ✅
2. Pick + profile the anchor dataset (eyeball the mess, document it)
3. Build v1 deterministic scorer + report page
4. Deploy (Vercel)
5. Add the Claude layer (v1.5)
6. Write the case-study (the portfolio centerpiece)
