# 인스타그램 주간 카드 — 설정과 흐름

매주 사이트의 인사이트로 카드(1080×1350 캐러셀)와 캡션을 만들고, **저장소 소유자가 승인해야** 인스타그램에 올립니다.

```
월요일 10:17 KST  trends.yml
  ├ 데이터 받기 → 검산 → 대시보드(/) 다시 만들기       (검산 하나라도 실패 → 아무것도 바꾸지 않고 이슈)
  ├ social/build.mjs   인사이트 → 카드 HTML
  ├ social/render.mjs  카드 → social/out/<날짜>/01.png …
  ├ social/caption.mjs Claude가 캡션 본문 작성 → 코드가 숫자·금지어 검사 (2번 실패하면 템플릿 캡션)
  ├ main에 커밋 → Vercel 배포 (이미지가 data.pivoxquant.com/social/out/… 에 공개됨)
  └ "[instagram] <날짜>" 이슈: 카드 미리보기 + 캡션
소유자가 이슈에 /approve  →  social-publish.yml → social/publish.mjs → 인스타그램 게시 → 이슈에 링크 남기고 닫음
                /reject   →  이번 주는 게시하지 않고 닫음
```

## 캡션 규칙 (코드가 강제)

- 본문의 **모든 숫자는 그 주 카드에 적힌 숫자**여야 합니다. 반올림하거나 새로 계산한 숫자는 거절됩니다.
- **추천·매수·매도·전망·예상·급등** 같은 말은 거절됩니다. 지난 숫자만 말하고 예측하거나 권하지 않습니다.
- 출처 줄, 링크, 면책 문구("예측이나 투자 권유가 아닙니다"), 해시태그는 모델이 아니라 코드가 붙입니다.
- 모델: `claude-opus-5-5` (안전 분류기가 거절하면 Anthropic 권장 모델로 다시 시도하는 `fallbacks: "default"` 켜 둠).

## 한 번만 하면 되는 설정

### 1. 인스타그램 토큰 (비즈니스 계정)

인스타그램 공식 API(Instagram API with Instagram Login)를 씁니다. 메타 화면 이름은 바뀔 수 있습니다.

1. [developers.facebook.com](https://developers.facebook.com) → 앱 만들기 → 사용 사례에서 **Instagram API**(인스타그램 로그인 방식) 추가.
2. 앱의 Instagram 설정에서 게시할 **비즈니스 계정을 연결**하고 권한 `instagram_business_basic`, `instagram_business_content_publish` 로 **액세스 토큰을 생성**합니다. 본인 계정에만 게시하므로 앱 검수(App Review) 없이 개발 모드로 됩니다.
3. 화면에 나오는 **인스타그램 사용자 ID**와 **토큰**을 복사합니다.
4. 토큰은 60일 동안 유효합니다. 만료 전에 아래 주소로 연장하세요(새 토큰이 나오면 GitHub 시크릿을 바꿔 넣기).
   `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<토큰>`

페이스북 페이지에 연결된 계정을 Facebook 로그인으로 쓰고 있다면 저장소 변수 `IG_GRAPH_HOST` 를 `graph.facebook.com` 으로 두면 됩니다.

### 2. GitHub에 넣을 것 (저장소 Settings → Secrets and variables → Actions)

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `ANTHROPIC_API_KEY` | Claude API 키 (없으면 템플릿 캡션으로 돌아감) |
| Secret | `IG_USER_ID` | 1-3의 인스타그램 사용자 ID |
| Secret | `IG_ACCESS_TOKEN` | 1-3의 토큰 |
| Variable (선택) | `IG_GRAPH_HOST` | 기본 `graph.instagram.com` |
| Variable (선택) | `IG_API_VERSION` | 기본 `v23.0` |
| Variable (선택) | `SEC_CONTACT` | SEC가 요구하는 연락처 이메일. 기본 `support@pivoxquant.com` |

그리고 Settings → Actions → General → Workflow permissions 를 **Read and write** 로 둬야 주간 작업이 커밋하고 이슈를 열 수 있습니다.

### 3. 첫 실행

Actions → **trends weekly** → Run workflow. 몇 분 뒤 `[instagram]` 이슈가 열리면 카드와 캡션을 보고 `/approve`.

## 로컬에서

```bash
npm ci
npm run trends                      # 데이터 → 검산 → 대시보드(/)
node social/build.mjs && node social/render.mjs && node social/caption.mjs
node social/publish.mjs social/out/<날짜>/post.json --dry-run   # 게시하지 않고 보낼 내용만 출력
```

`render.mjs` 는 Playwright의 Chromium을 씁니다(`npx playwright install chromium`, 또는 `CHROMIUM_PATH`).
