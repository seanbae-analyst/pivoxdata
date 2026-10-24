# AI 기술 신호 레이더

**▶ [data.pivoxquant.com](https://data.pivoxquant.com)** — 매주 월요일 갱신 · 무료 · 예측이나 투자 권유를 하지 않습니다.

기사보다 먼저 움직이는 숫자를 매주 같은 방식으로 잽니다 — 개발자가 실제로 내려받는 패키지(npm·PyPI), 연구자가
쓰는 말(arXiv — AI·양자·로보틱스·비전·보안·시스템 6개 분야), 사람들이 받는 오픈 모델(Hugging Face), 빅테크가 데이터센터에 쓰는 돈(SEC 공시). 크기보다
**평소보다 얼마나 빨리 커지는지**로 줄을 세우고, 화면의 문장은 모두 데이터로 계산돼 매주 다시 쓰입니다.

| 화면 | 내용 |
|---|---|
| [`/`](https://data.pivoxquant.com) | 주제 탭 — AI · 양자 · 로보틱스 · 비전 · 보안 · 시스템, 누르면 그 주제 인사이트만 최대 7장 (`/#quantum`처럼 주소로 공유) · 근거(표·차트·방법·검산, 접힘) |
| [`/map`](https://data.pivoxquant.com/map) | 데이터 지도 — 연구 → 오픈소스 → 개발자 채택 → 모델 → 자본, 데이터마다 잇는 키와 공개 조건 |
| 인스타그램 | 같은 인사이트로 만든 주간 카드 — 소유자가 승인해야 게시 ([social/README.md](social/README.md)) |

## 돌리는 법

```bash
npm ci
npm run trends        # 받기(fetch) → 검산(verify) → 페이지 만들기(build)
npm run trends:build  # 받은 데이터로 검산·빌드만 (네트워크 없음)
npm run social        # 인스타그램 카드 → PNG → 캡션 (social/out/<날짜>/)
npm run dev           # http://localhost:8099
```

매주 월요일 10:17 KST에 GitHub Actions(`.github/workflows/trends.yml`)가 같은 일을 합니다. 검산이 하나라도 어긋나면
아무것도 바꾸지 않고 이슈를 엽니다.

## 구조

```
trends/series.mjs   지켜보는 것 한 곳 — npm·PyPI 패키지(+대조군), arXiv 분야·말, Hugging Face, SEC 회사
trends/fetch.mjs    소스별 받기, 출처·받은 날과 함께 trends/data/*.json 으로
trends/signals.mjs  읽는 법 — 주간 수준(0이 아닌 평일의 중앙값), 끊김 감지(대조군만), 대조군 대비 초과 성장
trends/verify.mjs   검산 → trends/data/checks.json (같은 숫자를 다른 경로로 한 번 더 읽기)
trends/build.mjs    index.html · map.html 채우기, trends/data/insights.json (카드·캡션의 원천)
trends/site.mjs     모든 페이지 공통 head·상단·하단, sitemap.xml · robots.txt
social/             인스타그램 카드(build·render), 캡션(Claude + 숫자 검사), 게시(publish, 승인 후)
charts.mjs          선·막대 차트 (인라인 SVG, 키보드, CSV)
```

## 읽는 법 — 왜 이렇게 재나

- **다운로드는 사용자 수가 아닙니다.** 자동 빌드가 큰 몫이라 크기보다 같은 소스 안의 변화를 봅니다.
- **대조군.** react·lodash·express·typescript·axios(npm), requests·numpy·pandas·urllib3·packaging(PyPI). 순위는
  4주 성장에서 대조군 중앙값을 뺀 **초과 성장**으로 매깁니다 — 소스 전체가 오르는 계절 몫을 빼기 위해서입니다.
- **집계 오류를 피합니다.** npm은 0으로 적힌 날과 몰아서 들어온 날이 있어 주간 수준을 평일 중앙값으로 잡고,
  PyPI가 2026-08-24 주에 한꺼번에 반으로 준 것처럼 대조군이 함께 30% 넘게 움직이면 집계 변화로 보고 그 뒤만 비교합니다.
  둘 다 페이지 검산 목록에 그대로 적습니다.
- **SEC 설비투자**는 연초부터 누적으로 공시돼 분기 값을 차이로 구하고, 3개월 값을 따로 공시한 분기에서는 두 값이
  1% 안에서 맞는지 확인합니다.

## 출처와 이용 조건 (2026-10-24 약관 확인)

npm 다운로드 수 API · pypistats(PyPI BigQuery 공개 데이터, CC BY 4.0) · arXiv API(메타데이터 CC0) · Hugging Face Hub
API · SEC EDGAR XBRL(미국 정부 공개 자료). npm·Hugging Face는 다운로드 수를 다른 곳에 싣는 조건을 약관에 따로 적지
않았습니다 — 집계만 싣고 출처를 밝힙니다. 자세한 문구는 [데이터 지도](https://data.pivoxquant.com/map). 법률 자문이 아닙니다.
