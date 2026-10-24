# 개인투자자 데이터 연구소 · Korean Retail Investor Data Lab

**▶ [data.pivoxquant.com](https://data.pivoxquant.com)** — free, non-commercial. No ads, no payment, no investment advice.

**한국 개인투자자가 실제로 어떻게 움직였는지 공개 데이터로 확인합니다.** 질문은 넷입니다 — 언제 몰려 사나, 빚을
얼마나 내나, 어디로 나가나, 매매를 기록하긴 하나. 답이 있는 것은 연구 페이지로, 없는 것은 없다고 적었습니다.
숫자마다 출처 표·항목 코드·받은 날·이용 조건·검산 결과를 함께 싣고, 데이터를 해석하는 문장은 페이지를 만드는
단계에서 데이터와 대조해 틀리면 배포 전에 멈춥니다.

| 질문 | 페이지 | 데이터 |
|---|---|---|
| 개인은 언제 몰려 샀나 | [`/research/net-buy`](https://data.pivoxquant.com/research/net-buy) | ECOS 901Y055 (원작성 한국거래소), 2004–2026 월별 |
| 빚을 내 산 주식은 얼마나 되나 | [`/research/credit`](https://data.pivoxquant.com/research/credit) | ECOS 901Y056 (원작성 금융투자협회) + 901Y014 (한국거래소), 1999–2026 월말 |
| 개인은 어디로 나가나 | [`/research/abroad`](https://data.pivoxquant.com/research/abroad) | ECOS 281Y002·281Y001 자금순환 (한국은행 작성), 가계 해외주식 잔액·순취득 2008–2026 분기 — 나라별은 예탁결제원 자료(API 키 필요), [지도](https://data.pivoxquant.com/maps/korea-investor)에 경로만 |
| 개인은 매매를 기록하나 | [`/research/record-habit`](https://data.pivoxquant.com/research/record-habit) | 열린 질문 — 물은 공개 조사 0건, 가까운 공식 숫자 3개 |

In English: a research site on Korean retail investors built from public data — when they pile in, how much they
borrow to buy, where they go abroad, and whether they keep a record of their trades. Every number carries its
source table, fetch date, license terms and a second-reading check (see [`lab/`](lab) and [TRUST.md](TRUST.md)).

## The lab pipeline · `npm run lab`

```bash
npm run lab          # fetch (ECOS) → verify → build: refreshes every number on the research pages
npm run lab:build    # rebuild pages from the committed lab/data/*.json only (no network)
```

- [`lab/series.mjs`](lab/series.mjs) — every ECOS series the lab uses (table, item code, unit, who compiled it).
- [`lab/fetch.mjs`](lab/fetch.mjs) → `lab/data/<id>.json` with provenance (table, items, the compiling agency as
  ECOS reports it, fetch date). The public `sample` key reads 10 rows per call; set `ECOS_KEY` to use a personal key.
- [`lab/verify.mjs`](lab/verify.mjs) → `lab/data/checks.json`. Each check reads the numbers a second way: months are
  gap-free; the five investor groups net to zero (±2 백만원 rounding); annual tables equal the sum (flows) or the
  December value (balances) of the monthly ones; the compiling agency printed on the page equals ECOS's; month-end
  credit balances equal figures reported in the news from KOFIA's daily data
  ([`lab/data/crosscheck.json`](lab/data/crosscheck.json)). Known holes are recorded, not smoothed
  (신용융자 1998-06 and 1998-12 are written as 0 in ECOS).
- [`lab/build.mjs`](lab/build.mjs) writes numbers into marked regions of each page (`<!--@name-->…<!--/@name-->`), so
  the figures are in the HTML (readable without JS, indexable), plus the shared nav/footer/OG tags and `sitemap.xml`.
  Interpretive sentences are guarded with `expect(...)`: if a re-fetch changes the fact a sentence rests on
  (e.g. the peak month), the build stops instead of publishing a sentence that is no longer true.
- License: ECOS lets statistics compiled by other agencies be used **non-commercially with the source named**;
  commercial use needs the compiling agency's approval. That is why the site stays free and ad-free.

## DataReady — the file checker at [`/check`](https://data.pivoxquant.com/check)

The lab grew out of DataReady: drop a CSV or Excel file, get a **0–100 AI-readiness score** with prioritized,
plain-language fixes. Runs entirely in the browser; nothing is uploaded. **📖 Case study:** [CASE_STUDY.md](CASE_STUDY.md).

화면은 한국어 · 영어 둘 다 됩니다. 브라우저 언어를 따르고, 위쪽 버튼이나 `?lang=ko` / `?lang=en`으로 바꿉니다.
데이터 지도는 한국 공공데이터를 다뤄 한국어로만 있습니다.

## How the score is measured · AI-ready 점수 기준

Source of truth: [`scorer.mjs`](scorer.mjs). The score is a weighted sum of three areas; each starts at 100 and
loses points per problem (never below 0). **80–100** AI-ready · **55–79** needs cleanup · **0–54** not ready.
**Any personal-data issue caps the verdict** at "Remove personal data first", whatever the score (below 55 it stays
"Not ready"); the number itself is not changed. One function, `verdictFor()` in `scorer.mjs`, feeds both the CLI and the page.

점수는 세 영역의 가중합입니다. 영역마다 100점에서 시작해 문제 하나마다 깎습니다(0점 아래로는 안 내려감).
**80–100** AI에 넣어도 됨 · **55–79** 정리 필요 · **0–54** 아직 안 됨.
**개인정보가 하나라도 있으면** 점수와 상관없이 판정은 "개인정보부터 처리"입니다(55점 미만은 "아직 안 됨" 그대로). 점수 숫자는 바꾸지 않습니다.

| Area · 영역 | Counted as a problem · 문제로 세는 것 | Points off · 감점 |
|---|---|---|
| **Completeness · 완전성 (40%)** | Column entirely empty · 전부 빈 열 | −12 |
| | Column ≥ 50% empty · 50% 이상 빈 열 | −8 |
| | Column ≥ 20% empty · 20% 이상 빈 열 | −4 |
| | Blanks dressed as data (N/A, NULL, none, unknown, TBD, "-", 미상, 없음, 해당없음, 모름, 무응답, 알 수 없음, 미입력), counted on top of the rules above; not in an entirely empty column. 없음 is an answer, not a blank, when the same column also says 있음; 기타 is a real category and never counts · 값처럼 적힌 빈칸 (위 감점과 따로 셈, 전부 빈 열은 제외. 같은 열에 있음이 있으면 없음은 답. 기타는 세지 않음) | −2 |
| | Unreadable characters (�) in column names, and in values — one problem each for the whole file · 읽을 수 없는 글자(�) — 열 이름에 하나, 값에 하나 | −8 each · 각 −8 |
| **Consistency · 일관성 (35%)** | Exact duplicate rows · 완전히 같은 행 | −3 + duplicate %, max −15 · 최대 −15 |
| | Numbers and text mixed in one column (10–90% numeric; not counted in personal-data / ID-number columns, or when units explain all the text) · 숫자·글자가 섞인 열 (개인정보·식별번호 열, 단위로 설명되는 경우 제외) | −6 |
| | Numbers written with a unit (1,234원 · 1.2만원 · 3억) in a column that is ≥ 90% numbers or unit-numbers · 단위 붙은 숫자 | −6 |
| | Dates written more than one way (ISO · US slash · "March 5, 2021" · 2021.03.05 · 2021. 3. 5. · 2021년 3월 5일 · 2021/03/05 · 21-03-05) · 날짜 형식이 여럿 | −8 |
| | Placeholder dates 1900-01-01 / 0000-00-00 · 자리만 채운 날짜 | −6 |
| | ID column with repeats (name ends in id/uid/uuid/guid, ≥ 90% unique) · 값이 겹치는 ID 열 | −8 |
| | Same value spelled several ways (USA / usa / U.S.A.) · 같은 값의 여러 표기 | −4 |
| **Personal data · 개인정보 (25%)** | ≥ 30% of filled values (and ≥ 3) look like email, phone, US SSN, Korean resident/foreigner registration number, or — only under a 계좌 / account-number header — a bank account number · 채워진 값의 30% 이상(최소 3개)이 이메일·전화번호·미국 SSN·주민등록번호/외국인등록번호·(계좌 열의) 계좌번호 꼴 | −15 per column · 열마다 |

**How the personal-data shapes are told apart · 개인정보 판별 기준**

- **Phone:** 10–15 digits with separators, exactly 10–11 bare digits, or a Korean number written with dots
  (`010.4567.8901`, `02.123.4567`). Other decimals (coordinates), dates, and columns named "…code" / "…코드" never count.
- **주민등록번호 / 외국인등록번호 (`kr_rrn`):** `YYMMDD-G######`, with or without the hyphen. Recognized by shape **and validity**:
  the first six digits must be a real calendar date in the century the 7th digit implies (1/2/5/6 → 1900s, 3/4/7/8 → 2000s;
  5–8 are foreigner numbers), and not in the future. **No checksum** — numbers issued since October 2020 have random digits
  after the 7th, so the old check digit would miss them. The bare 13-digit form passes only on the same date + digit rule,
  which keeps order numbers like `2026102200001` out. Columns named 법인 / corp are skipped (법인등록번호 shares the layout).
- **Bank account (`bank_account`):** only when the header says so (계좌, or account/acct with bank/no/number). Account numbers
  have no shape of their own, so shape alone would flag every long id.
- **사업자등록번호 is not personal data here.** `###-##-#####` with a valid check digit (or bare 10 digits under a 사업자 header)
  is labelled "business registration no." and costs no points. Rationale: it identifies a business, and is published on
  invoices and storefronts; for a sole proprietor it can point to a person when joined with other data, so it is shown,
  not hidden — but scoring it as PII would put a −15 on every supplier list. It is also never called "phone" any more
  (a 3-2-5 grouping is not a phone layout, check digit or not).

- **Facts vs judgment · 사실과 판단.** Every issue carries its raw evidence (`missing=26/44`); the weights and points are a
  judgment, documented in [TRUST.md](TRUST.md) and tunable. 문제마다 근거 숫자가 붙고, 가중치·감점은 적어 둔 판단입니다.
- **Not measured · 재지 않는 것.** Whether values are true, whether the data represents what you study, whether you may use
  it (→ data maps). Outliers and skew appear as patterns after cleanup, not in the score. 값의 사실 여부, 대표성, 이용 가능 여부.
- **Korean files · 한국 파일.** CSVs are read as bytes: strict UTF-8 first, then CP949 (EUC-KR) — the encoding of most
  Korean public-data downloads — with a visible "read as CP949" notice; anything else is decoded with � for the unreadable
  bytes and reported, never silently guessed ([`encoding.mjs`](encoding.mjs)). Node's built-in `euc-kr` decoder lacks the
  CP949 extension (8,822 Hangul such as 똠·햏·뷁), so `encoding.mjs` derives that table; it matches Python's `cp949` codec on
  all 17,048 codes. Excel date cells in the default short-date format come out as ISO (`2026-10-22`), not `10/22/26`.
  UTF-8가 아니면 CP949로 읽고 그 사실을 보여 줍니다. 엑셀 날짜 칸은 ISO로 읽습니다.
- **Known gaps · 아직 못 잡는 것.** Korean registration numbers are now detected. Still not: passport and driver's licence
  numbers; partly masked numbers (`900101-1******`); numbers inside free text; a column where fewer than 30% of values are
  personal data; bank accounts under a header that does not say account (they read as "phone" if phone-shaped); `yy.mm.dd`
  dates and compound amounts ("3억 5천만원", counted as text). A 13-digit id that happens to start with a real date and a
  1–8 (e.g. `2410221234567`) can still read as a registration number — the column needs ≥ 30% such values to be flagged.
  CSVs that are neither UTF-8 nor CP949 (e.g. Latin-1) are not auto-detected; their unreadable characters are reported.
  아직 못 찾는 것: 여권·운전면허 번호, 일부를 가린 번호, 글 속에 섞인 번호, 개인정보가 30% 미만인 열, 이름에 계좌가 없는 열의 계좌번호.

> A product-thinking portfolio piece by **Sanghyun Bae**. The full 1-page PRD is in
> [`PRD.md`](PRD.md); the trust model is in [`TRUST.md`](TRUST.md).

---

## Run it

```bash
npm install
npm run dev          # → http://localhost:8099  (lab home; the checker is at /check)
```

The app uses native ES modules, so it must be served over HTTP — opening `check.html`
directly as a `file://` will not load the scorer. `npm run dev` is the one step that matters.

```bash
npm run score test-data/customers_messy.csv   # same scorer, from the terminal
npm run validate                              # precision/recall + oracle agreement gate
```

Deploy: static site, no build step on the server — `vercel deploy` (config in [`vercel.json`](vercel.json)). The research
pages are rebuilt locally with `npm run lab` and committed.

---

## When to use it — and when not to

The common denominator: **the moment tabular data is about to enter an AI.**

Use it when:
1. **You're about to paste a CSV into ChatGPT/Claude.** The experiment below shows what
   happens otherwise — and a PII check is only meaningful *before* upload, by definition.
2. **The file is too big for the model to self-audit.** A frontier model hand-cleaned our
   44-row sample in-context; the 295,810-row anchor dataset doesn't even fit in a context
   window. RAG ingestion, fine-tuning sets, batch pipelines.
3. **The same analysis runs repeatedly.** In-context cleaning is improvised per prompt and
   wobbles between runs (measured — see the experiment). Dashboards, daily reports, agents
   need judgments made once, explicitly.
4. **The number ships.** An error stops a report; a confidently-wrong total goes into the
   board deck.
5. **Someone hands you a CSV you've never seen.** A 30-second readiness verdict before you
   invest analysis time.

Skip it when:
- Your org already runs real data-quality infra (dbt tests, Great Expectations) — this is
  the lightweight gate *in front of* an AI prompt, not a replacement for pipeline DQ.
- Your problem needs judgment-level repair (imputation, `"thirty"` → 30, semantic merging) —
  the tool deliberately refuses to guess.
- Your data is wrong-but-well-formed (a valid-looking phone number that's not the right
  number). Form is checkable; truth needs a source of record (see TRUST.md).
- Multi-sheet / merged-cell Excel or multi-file joins — out of scope in v1.
- A tiny throwaway file with no PII and a frontier model on the other side — honest answer:
  in-context self-cleaning may be enough for a one-off.

## What it does

CSV/XLSX in → score across dimensions → a ranked, plain-language issue list, each tagged as a
**verifiable fact** with its raw evidence. v1 scores three deterministic dimensions
(no AI, fully reproducible):

| Dimension | Catches |
|---|---|
| **Completeness** | empty columns, high-missing columns, sentinel values (`N/A`, `NULL`, `-`) |
| **Consistency** | mixed date formats, placeholder dates (`1900-01-01`), numeric/text mixing, duplicate rows, repeated IDs, one value spelled several ways |
| **PII** | email / phone / SSN / 주민등록번호 · 외국인등록번호 / (account-named) bank-account columns → governance flag; caps the verdict |

Scores are **judgments built on facts** — the facts underneath are always inspectable, and the
dimension weights are explicit and tunable. (See `TRUST.md` for why that separation matters.) Exact rules and
point values: [How the score is measured](#how-the-score-is-measured--ai-ready-점수-기준).

### …and it closes the loop: score → clean → download (v1.1)

Detection without remediation is half a product. The **"Clean it"** button (and
`npm run score file.csv -- --fix`, or `node cli.mjs file.csv --fix`) applies every fix that is
*mechanically unambiguous* — dedupe exact rows, normalize mixed dates to ISO 8601, convert
sentinel tokens to real empties, clear placeholder dates, drop 100%-empty columns — then
re-scores the cleaned data and hands you the CSV. On the bundled CRM sample that's **79 → 95**.

Every policy knob is the **user's** judgment, asked in the UI: date convention (ISO vs US),
PII handling (keep / mask / drop column), spelling-cluster canonicals (pick one or type your
own), casing normalization per column, header style (snake_case / lowercase), duplicates,
placeholder dates, sentinels, empty rows/columns, whitespace, Excel-friendly BOM on download.

What it deliberately does **not** do is guess: imputing missing values, coercing `"thirty"` → 30,
and semantic unification are *judgments*, so [`fixer.mjs`](fixer.mjs) reports them as
"left alone — needs human judgment" instead of silently altering data. Same fact-vs-judgment
line as the scorer, enforced by the validation gate (`npm run validate`, sections 3–5).

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
a customers dataset with a schema the scorer has never seen and 10 deliberately planted defects
(duplicate-ID detection joined the set when the Keys/uniqueness slice shipped).
Current result: **recall 10/10 (100%), precision 100%** — every planted defect caught, nothing
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
| Monte Carlo (20,000 datasets, 99,045 defects) | **recall 100% · precision 100% · 0 crashes** |
| Edge cases (0 rows, all-empty, unicode, emoji, 60 cols…) | **16/16 survive, sane output** |
| PII traps (ids, zips, years, coords, prices, 13-digit order numbers, 사업자등록번호…) — 18 columns | **0 false positives, 0 misses, 1 documented residual (`bbl`)** |
| Throughput | **~42,000 rows/sec** on the machine of the 2026-10-22 run (100k rows in ~2.4 s). The unchanged pre-Korean-checks scorer measures ~38–45k rows/s on that same machine, so the earlier ~150k figure reflects faster hardware, not a slowdown. |

Deterministic (seeded), so the numbers reproduce exactly: `node sim.mjs <seed> <N> --report`.

### From readiness to insight — the analysis layer

After cleanup the app also tells you what the file *says*: [`insights.mjs`](insights.mjs)
detects six deterministic patterns (granularity traps, weighted-average bias, structural
missingness, concentration, segment gaps, outliers), each emitted only as **fact + baseline
+ so-what** and ranked by materiality — below-threshold observations stay silent. The shapes
were not invented: they are the generalized findings of [a real manual analysis of the
295k-row NYC dataset](analysis/ANALYSIS.md) (clean → analyze → findings → recommendation,
with DataReady dogfooded as step 1), and the engine re-discovers that analysis' headline
findings on its own (9.5 rows per restaurant; grade blanks 62% vs 4% by inspection type).
Gate: `validate.mjs` §8 — including an honest-silence test on clean data.
Known residual (documented, like the `bbl` case): entity-key *semantics* — the finest
repeating key is reported even when a human would name a different column the entity.

### Does the score matter? — the "so what" experiment

We asked a real LLM the same five analyst questions on the dirty demo file and on the
DataReady-cleaned version ([`experiment/SO_WHAT.md`](experiment/SO_WHAT.md) — protocol,
ground truth, and raw transcripts, committed unedited). Cheap tier on dirty: total inflated
by $18,500, "earliest deal: 1900-01-01." Frontier tier on dirty: right numbers via silently
improvised judgment calls that flipped between two identical runs. On clean: correct,
direct, reproducible — and 0 raw emails in the prompt instead of 44.

The app generalizes this to **every uploaded file**: after cleanup it re-runs the same
schema-derived analysis (totals, date ranges, group-by counts, PII exposure) on both
versions and shows exactly which answers changed — deterministic code on both sides
([`analyzer.mjs`](analyzer.mjs), gated by `validate.mjs` §7).

---

## Anchor dataset

NYC DOHMH Restaurant Inspections — 295,810 rows × 27 cols of real, messy government data that
triggers every dimension at once. Details and the re-download command are in
[`ANCHOR_DATASET.md`](ANCHOR_DATASET.md). The 138 MB full file is git-ignored (re-download to
reproduce `verify.py`); the 2.5 MB sample is committed so the demo and CLI work out of the box.

---

## Layout

```
index.html        lab home — the four questions, principles, tools
research/*.html   research pages (credit, net-buy, abroad, record-habit) — numbers written in by lab/build.mjs
research.css      layout for research pages · charts.mjs  shared line/bar charts (inline SVG, keyboard, CSV)
lab/              series.mjs · ecos.mjs · fetch.mjs · verify.mjs · build.mjs · data/*.json (with provenance)
check.html        DataReady, the file checker (drag-drop → score → clean)
ui.css            shared tokens + base styles for every page (black + bronze, Pretendard)
maps.html         data maps index — one question, the public datasets for it, how they join
maps/*.html       the maps themselves (manual research, metadata only — no data is fetched)
scorer.mjs        the deterministic scorer — pure function, runs identically in browser + Node
lang.mjs          display language switch (English default; the browser sets 한국어) — messages go through L(en, ko)
encoding.mjs      bytes → text: UTF-8 / BOM / CP949 (EUC-KR) with a notice, shared by the browser and the CLI
parse.mjs         CSV/XLSX → rows (Node CLI)
cli.mjs           score any file from the terminal
serve.mjs         zero-dependency static server (npm run dev)
validate.mjs      precision/recall + oracle-agreement gate
verify.py         3-engine triangulation harness → verified_facts.json
og/  sitemap.xml  robots.txt  404.html  favicon.svg   sharing and crawling
PRD.md TRUST.md ANCHOR_DATASET.md   the product thinking
```
