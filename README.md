# AX 트렌드 레이더

**▶ [data.pivoxquant.com](https://data.pivoxquant.com)** — 매일 갱신 · 무료.

기사보다 먼저 움직이는 숫자를 매일 같은 방식으로 잽니다 — 개발자가 실제로 내려받는 패키지(npm·PyPI), 연구자가
쓰는 말(arXiv — AI·양자·로보틱스·비전·보안·시스템 6개 분야), 사람들이 받는 오픈 모델(Hugging Face), 빅테크가 데이터센터에 쓰는 돈(SEC 공시). 크기보다
**평소보다 얼마나 빨리 커지는지**로 줄을 세우고, 화면의 문장은 모두 데이터로 계산돼 매일 다시 쓰입니다.
다운로드는 주 단위로 정산이 끝난 숫자만, 논문은 다 지난 달만 씁니다 — 하루치 몰림이 신호로 둔갑하지 않게.

| 화면 | 내용 |
|---|---|
| [`/`](https://data.pivoxquant.com) | 읽는 법 · 최근 7일 변화(빅 케이스·작은 변화) · 주제 탭 — AI · 양자 · 로보틱스 · 비전 · 보안 · 시스템, 누르면 그 주제 카드만 최대 7장 (`/#quantum`처럼 주소로 공유). 카드마다 "쉽게 말하면" 한 줄, 밑줄 친 말을 누르면 풀이 · 용어 풀이 15개 · 근거(표·차트·방법·검산, 접힘) |
| [`/map`](https://data.pivoxquant.com/map) | 데이터 지도 — 연구 → 오픈소스 → 개발자 채택 → 모델 → 자본, 데이터마다 잇는 키와 공개 조건 |
| 인스타그램 | 빅 케이스는 그날, 작은 변화는 일주일치를 모아 만든 카드 — 매번 다른 그림·배치, 소유자가 승인해야 게시 ([social/README.md](social/README.md)) |

## 돌리는 법

```bash
npm ci
npm run trends        # 받기(fetch) → 검산(verify) → 페이지 만들기(build)
npm run trends:build  # 받은 데이터로 검산·빌드만 (네트워크 없음)
npm run social        # 오늘 올릴지 판단 → 카드 → PNG → 캡션 (social/out/<날짜>/)
npm run dev           # http://localhost:8099
```

매일 10:17 KST에 GitHub Actions(`.github/workflows/trends.yml`)가 같은 일을 합니다. 검산이 하나라도 어긋나면
아무것도 바꾸지 않고 이슈를 엽니다(같은 실패가 이어지면 그 이슈에 댓글).

## 구조

```
trends/series.mjs   지켜보는 것 한 곳 — npm·PyPI 패키지(+대조군), arXiv 분야·말, Hugging Face, SEC 회사
trends/fetch.mjs    소스별 받기, 출처·받은 날과 함께 trends/data/*.json 으로
trends/signals.mjs  읽는 법 — 주간 수준(0이 아닌 평일의 중앙값), 끊김 감지(대조군만), 대조군 대비 초과 성장
trends/verify.mjs   검산 → trends/data/checks.json (같은 숫자를 다른 경로로 한 번 더 읽기)
trends/build.mjs    index.html · map.html 채우기, 변화 찾기(changes.json · state.json), insights.json (카드·캡션의 원천)
trends/glossary.mjs 용어 풀이 15개 — 페이지의 "용어 풀이"와 카드 속 밑줄 친 말이 같은 문장을 씀
trends/viz.mjs      인사이트를 그리는 방법 12가지 (선·면적·막대 / 기울기·두 막대·화살표 / 도넛·와플·띠 / 순위 막대·점·시상대)
trends/site.mjs     모든 페이지 공통 head·상단·하단, sitemap.xml · robots.txt
social/             오늘 올릴지(plan), 카드(build·render), 캡션(Claude + 숫자 검사), 게시(publish, 승인 후)
charts.mjs          선·막대 차트 (인라인 SVG, 키보드, CSV)
```

## 읽는 법 — 왜 이렇게 재나

- **다운로드는 사용자 수가 아닙니다.** 자동 빌드가 큰 몫이라 크기보다 같은 소스 안의 변화를 봅니다.
- **대조군.** react·lodash·express·typescript·axios(npm), requests·numpy·pandas·urllib3·packaging(PyPI). 순위는
  4주 성장에서 대조군 중앙값을 뺀 **초과 성장**으로 매깁니다 — 소스 전체가 오르는 계절 몫을 빼기 위해서입니다.
- **집계 오류를 피합니다.** npm은 0으로 적힌 날과 몰아서 들어온 날이 있어 주간 수준을 평일 중앙값으로 잡고,
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

## 출처와 이용 조건 (2026-10-24 약관 확인)

npm 다운로드 수 API · pypistats(PyPI BigQuery 공개 데이터, CC BY 4.0) · arXiv API(메타데이터 CC0) · Hugging Face Hub
API · SEC EDGAR XBRL(미국 정부 공개 자료). npm·Hugging Face는 다운로드 수를 다른 곳에 싣는 조건을 약관에 따로 적지
않았습니다 — 집계만 싣고 출처를 밝힙니다. AX 지표는 Ramp AI Index(Ramp Economics Lab, FRED 제공 — 인용 표시 조건)이고, "AX 사건"은 각 회사·기관이
직접 낸 발표(뉴스룸·공식 블로그·보도자료 RSS)의 제목·요약과 원문 링크만 싣습니다 — 본문을 옮겨 싣지 않습니다. 자세한 문구는 [데이터 지도](https://data.pivoxquant.com/map). 법률 자문이 아닙니다.
