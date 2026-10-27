# AX 트렌드 레이더

**▶ [data.pivoxquant.com](https://data.pivoxquant.com)** — 매일 갱신 · 무료.

IT 컨설팅 관점으로 기업의 AI 전환(AX)을 매일 같은 방식으로 잽니다. 미국 기업의 AI 결제 도입률(Ramp AI Index)과,
회사·정부·기관이 **직접 낸 공식 발표**를 IT 영역(ERP·백오피스 / CRM·고객 / 클라우드·인프라 / 데이터·분석 / 업무 도구 /
보안·규제 / AI 에이전트)별로 나눠 셉니다. 화면의 문장은 모두 데이터로 계산돼 매일 다시 쓰입니다.
방향과 결정 이력: [CLAUDE.md](CLAUDE.md) · [docs/decisions.md](docs/decisions.md).

### 지금 구조 (2026-10-27 — 뉴스 사이트처럼)

모든 화면이 **위아래로 읽는 한 페이지**다. 위에는 이름과 메뉴 한 줄(리서치 · 공식 발표 · 지표 · 용어 풀이 · 데이터 지도 · 저장 · 로그인)뿐이고,
폰에서는 그 한 줄이 옆으로 밀린다. 아래 탭 바 · 옆으로 넘기는 페이지 · 첫 방문 표지는 없다(`docs/decisions.md` 35, 36).
같은 것을 두 곳에 두지 않는다 — 리서치 목록 · 주제 · 형식은 `/briefs` 한 곳에만.

| 주소 | 무엇 | 만드는 곳 |
|---|---|---|
| [`/`](https://data.pivoxquant.com) | 1면 — 한 줄 머리말 → 이번 주 이야기(머리기사: 사례 · 공통 흐름 · IT 컨설팅 관점, "지난 리서치 모두 보기 →") → 공식 발표(원문 링크) → 숫자로 보면(KPI · 최근 변화 · 지표 탭: 기업 도입률 / IT 영역별 발표) → 용어 풀이 → 근거 데이터(npm·PyPI·arXiv·Hugging Face·SEC) | `index.html` 틀 + `trends/build.mjs`(숫자 · 카드) · `social/briefs.mjs`(이번 주 이야기 · 용어) |
| [`/briefs`](https://data.pivoxquant.com/briefs) | 리서치 목록 — 검색 + 주제(IT 영역 7) · 형식(시리즈) 필터, 고른 것은 주소에(`?q=&topic=&format=`), 아래에 폰 설치 · 새 리서치 알림 | `social/briefs.mjs` |
| `/briefs/<폴더>` | 글 — 제목 · 저장 · 공유 → 사례마다 표와 풀이 → 공통 흐름 → IT 컨설팅 관점 → 정리 · 근거 · 관련 지표 · 같이 읽기. 넓은 화면은 왼쪽 목차(`toc.js`) | `social/briefs.mjs` (원문: `social/out/<폴더>/story.json`) |
| `/briefs/topic/<id>` · `/series/<id>` · `/tag/<id>` · `/feed.xml` | 주제 페이지(지표 → 리서치 → 공식 발표) · 형식 · 태그 목록 · RSS | `social/briefs.mjs` |
| [`/map`](https://data.pivoxquant.com/map) | 데이터 지도 — 데이터마다 잇는 키와 공개 조건 (넓은 화면은 목차) | `map.html` + `trends/build.mjs` |
| `/login` · `/auth/callback` · `/saved` · `/privacy` · `/terms` | 로그인(메일 코드 또는 링크) · 저장한 리서치 · 계정 · 처리방침 · 약관 | `trends/pages.mjs` · `trends/legal.mjs` |
| `/upload?slot=<폴더>` | 운영자 전용 — 긴 인스타 카드를 폰에 저장 · 캡션 복사 | `trends/pages.mjs` · `upload.js` |
| 인스타그램 | AX 사건은 11~20장 이야기(직접 게시), 그 밖은 10장까지 자동 | `social/` ([social/README.md](social/README.md)) |

브라우저 스크립트: `auth.js`(로그인) · `login.js` · `callback.js` · `acc-ui.js`(로그인 화면 단계) · `account.js`(저장 · 메뉴 · /saved) ·
`toc.js`(긴 글 · 지도의 목차) · `terms.js`(밑줄 친 용어 풀이) · `cardfig.js`(지표 카드 그림) · `upload.js`(운영자) · `sw.js`(오프라인 · 알림).
공통 틀(head · 메뉴 · 하단)은 `trends/site.mjs` 한 곳, 공통 스타일은 `ui.css`, 리서치 페이지 스타일은 `research.css` + `social/briefs.mjs` → `CSS`.

## 돌리는 법

```bash
npm ci
npm run trends        # 받기(fetch) → 검산(verify) → 페이지 만들기(build)
npm run trends:build  # 받은 데이터로 검산·빌드만 (네트워크 없음)
npm run social        # 오늘 올릴지 판단 → 이야기 → 카드 → PNG → 캡션 → 브리핑 (social/out/<한국 날짜>/)
npm run dev           # http://localhost:8099
```

매일 10:17 KST에 GitHub Actions(`.github/workflows/trends.yml`)가 같은 일을 합니다(GitHub 예약은 늦거나 빠질 수 있어 12:47 · 15:17 KST에 한 번씩 더 시도하고, 그날 데이터가 이미 있으면 바로 멈춥니다). 검산이 하나라도 어긋나면
아무것도 바꾸지 않고 이슈를 엽니다(같은 실패가 이어지면 그 이슈에 댓글).

## 구조

```
trends/series.mjs   지켜보는 것 한 곳 — AX(Ramp), 공식 발표 출처(NEWS)·IT 영역(DOMAINS)·도입 방식(METHODS), npm·PyPI 패키지(+대조군), arXiv, Hugging Face, SEC 회사
trends/feeds.mjs    공식 발표 RSS·Atom 읽기 (자기 도메인 링크만)
trends/fetch.mjs    소스별 받기, 출처·받은 날과 함께 trends/data/*.json 으로
trends/signals.mjs  읽는 법 — 주간 수준(0이 아닌 평일의 중앙값, 집계가 멈춘 날 제외), 끊김 감지(대조군만), 대조군 대비 초과 성장
trends/dates.mjs    날짜 계산 한 곳 (UTC 날짜 문자열끼리)
trends/verify.mjs   검산 42개 → trends/data/checks.json (같은 숫자를 다른 경로로 한 번 더 읽기)
trends/build.mjs    index.html · map.html 채우기, 변화 찾기(changes.json · state.json), insights.json (카드·캡션의 원천)
trends/glossary.mjs 용어 풀이 — 고정 23개 + 게시된 브리핑이 더한 말. 페이지의 "용어 풀이", 카드·브리핑 속 밑줄 친 말(terms.js)이 같은 문장을 씀
trends/viz.mjs      인사이트를 그리는 방법 12가지 (선·면적·막대 / 기울기·두 막대·화살표 / 도넛·와플·띠 / 순위 막대·점·시상대)
trends/site.mjs     모든 페이지 공통 head·상단·하단(esc 한 곳), sitemap.xml(noindex 페이지 제외) · robots.txt
social/             오늘 올릴지(plan), 이야기·사례(story, 원문 읽기 original), 카드(build·render), 캡션, 게시(publish), 웹 브리핑(briefs·roundup), 푸시(notify),
                    검사 한 벌(claude.mjs), 커밋·푸시(commit), 폴더 이름(slot), 공용(util)
toc.js · terms.js   긴 글 · 지도의 목차(넓은 화면) · 누르면 뜨는 용어 풀이(폰은 아래에서 올라오는 창)
charts.mjs          선·막대 차트 (인라인 SVG, 키보드, CSV)
auth.js · login.js · callback.js · acc-ui.js   로그인 — Supabase Auth 메일 코드 · 링크(라이브러리 없이), /login 단계, /auth/callback, 동의 세 개
account.js          모든 페이지: 저장 버튼 · 메뉴의 저장/로그인 · /saved(저장한 브리핑 · 계정 · 탈퇴) · 바뀐 약관 알림
trends/pages.mjs · trends/legal.mjs   /login · /auth/callback · /saved · /privacy · /terms 를 만들고, 처리방침 · 약관 · 동의 문구의 사실은 legal.mjs 한 곳
supabase/           로그인 켜는 순서(README) · 스키마(pd_* 함수만 열림) · 메일 템플릿 둘
tests/research.mjs  리서치 페이지를 브라우저로 — 검색 · 필터 · 뒤로가기 · 기존 링크 · 비로그인 읽기 · 지표 연결 · 새 글 자동 반영(복사본에서), 데스크톱과 폰
```

**로그인**(2026-10-26)은 `trends/site.mjs` → `AUTH`가 비어 있으면 어디에도 없다 — 메뉴에 로그인이 없고, 저장은 그 기기에만 남는다.
켜는 순서는 `supabase/README.md`.

## 읽는 법 — 왜 이렇게 재나

아래는 "근거 데이터"(개발자 다운로드·논문·오픈 모델·설비투자)를 재는 방법입니다. 인스타에는 올리지 않습니다.

- **다운로드는 사용자 수가 아닙니다.** 자동 빌드가 큰 몫이라 크기보다 같은 소스 안의 변화를 봅니다.
- **대조군.** react·lodash·express·typescript·axios(npm), requests·numpy·pandas·urllib3·packaging(PyPI). 순위는
  4주 성장에서 대조군 중앙값을 뺀 **초과 성장**으로 매깁니다 — 소스 전체가 오르는 계절 몫을 빼기 위해서입니다.
- **집계 오류를 피합니다.** npm은 0으로 적힌 날과 몰아서 들어온 날이 있어 주간 수준을 평일 중앙값으로 잡고,
  절반 넘는 패키지가 함께 0인 날(2026-10-13~15, 10-19~21)은 npm 집계가 멈춘 날로 보고 그 주는 남은 평일로 수준을 냅니다.
  PyPI가 2026-08-24 주에 한꺼번에 반으로 준 것처럼 대조군이 함께 30% 넘게 움직이면 집계 변화로 보고 그 뒤만 비교합니다.
  둘 다 페이지 검산 목록에 그대로 적습니다.
- **누가 앞서나(레이스).** 분야마다 경쟁하는 도구 몇 개를 묶어, 그 안에서 각자 다운로드 몫이 얼마고 4주·3개월·1년 사이
  어떻게 움직였는지 봅니다 — AI 회사 SDK(자바스크립트·파이썬), 앱에 연결하는 모델, AI 코딩 도구, 에이전트 도구,
  벡터 DB, 모델 직접 돌리기, AI의 브라우저 조작, 음성 AI, AI 품질 관리, 모델 맞춤 학습, 오픈 모델 제작사.
  목록은 `trends/series.mjs`의 `RACES` 한 곳. 1위가 바뀌면 빅 케이스입니다.
- **작은 변화.** 오늘 숫자를 어제 숫자와 견줘 순위 변동·새로 든 것·비중 1%p 이동·논문 집계·한 회사의 공시를
  잡고, 사이트 "최근 변화"에 쌓습니다. 인스타그램에는 일주일치를 모아 올립니다([social/README.md](social/README.md)).
- **빅 케이스.** 1위 교체(앱에 붙이는 모델) · 지난주 다운로드가 직전 평소의 1.4배 이상(대조군과 AI 패키지 전반의 몫을 뺀 뒤) ·
  역대 최고를 10% 넘게 경신 · 논문 속 비율이 1년 전의 2.5배를 처음 넘은 말 · Hugging Face 트렌딩 새 1위 ·
  빅테크 4사 새 분기 설비투자 공시. 기준은 `trends/build.mjs`의 `SURGE`·`ATH`·`PAPER`.
- **SEC 설비투자**는 연초부터 누적으로 공시돼 분기 값을 차이로 구하고, 3개월 값을 따로 공시한 분기에서는 두 값이
  1% 안에서 맞는지 확인합니다.

## 탭 구성 (IT 컨설팅 관점, 2026-10-25)

**기업 도입률**(Ramp AI Index: 업종·규모·AI 회사별 도입률) · **IT 영역별 발표**(공식 AX 발표를 7개 IT 영역으로 나눠
최근 30일 건수와 발표가 많은 회사 — `trends/series.mjs` → `DOMAINS`, 소비자 제품 발표는 빼고 셈). 양자·로보틱스·비전·보안·시스템
기술 주제와 "누가 앞서나"는 첫 화면에서 뺐고, 다운로드·논문·오픈 모델·설비투자·레이스 데이터는 "근거 데이터"에 남깁니다.

## 출처와 이용 조건 (2026-10-24 약관 확인)

npm 다운로드 수 API · pypistats(PyPI BigQuery 공개 데이터, CC BY 4.0) · arXiv API(메타데이터 CC0) · Hugging Face Hub
API · SEC EDGAR XBRL(미국 정부 공개 자료). npm·Hugging Face는 다운로드 수를 다른 곳에 싣는 조건을 약관에 따로 적지
않았습니다 — 집계만 싣고 출처를 밝힙니다. AX 지표는 Ramp AI Index(Ramp Economics Lab, FRED 제공 — 인용 표시 조건)이고, "AX 사건"은 각 회사·기관이
직접 낸 발표(뉴스룸·공식 블로그·보도자료 RSS)의 제목·요약과 원문 링크만 싣습니다 — 본문을 옮겨 싣지 않습니다.
게시물을 쓸 때 사례를 채우려고 발표의 공식 페이지를 읽지만, 그 글은 저장하지도 싣지도 않고 24자 넘게 같은 문장은 거절합니다. 자세한 문구는 [데이터 지도](https://data.pivoxquant.com/map). 법률 자문이 아닙니다.
