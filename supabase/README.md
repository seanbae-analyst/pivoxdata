# 로그인 켜기 (Supabase, 2026-10-26)

로그인 코드와 화면은 들어가 있고 **꺼져 있다**. `trends/site.mjs` → `AUTH` 의 `url` · `key` 가 비어 있으면 로그인은 어디에도 없다
(메뉴 · 소개 다음의 로그인 단계 · 처리방침의 로그인 절). 아래를 하면 켜진다. 흐름과 이유는 `docs/decisions.md` 23번.

## 0. 프로젝트 자리 (소유자가 정한다)

Supabase 무료 프로젝트는 계정당 **2개**이고(일시정지한 것은 안 센다) 지금 PivoxMap · PivoxQuant 가 쓰고 있다(2026-10-26 `list_projects`).
- 새 프로젝트: 조직을 Pro 로 올려야 한다(월 $25 + 프로젝트마다 컴퓨트 약 $10, 크레딧 $10 — 세 개면 약 $45/월, Supabase 요금 문서).
- 이미 있는 프로젝트를 같이 쓰기: 이 파일의 스키마(`pivoxdata`)는 따로라 표가 섞이지 않지만, 로그인 사용자 목록(`auth.users`)과
  메일 설정 · 사이트 주소는 그 프로젝트와 같이 쓴다. PivoxQuant 는 Supabase 로그인을 쓰지 않는다(그 저장소에 supabase-js · `/auth/v1` 없음).

## 1. 스키마

`supabase/schema.sql` 을 그 프로젝트에서 한 번 돌린다(SQL editor, 또는 Supabase MCP `apply_migration`). 다시 돌려도 바뀌는 게 없다.
- 표는 `pivoxdata` 스키마에 있고 REST 에 열지 않는다. 브라우저는 `public.pd_*` 함수로만 닿고, 함수마다 **부른 사람 자기 행만** 읽고 쓴다.
- 확인: publishable 키로 `POST /rest/v1/rpc/pd_saved_list` 를 로그인 없이 부르면 401 이어야 한다.

## 2. Authentication 설정 (대시보드)

1. **URL Configuration**
   - Site URL: `https://data.pivoxquant.com`
   - Redirect URLs: `https://data.pivoxquant.com/auth/callback` · `http://localhost:8099/auth/callback`
     (프리뷰에서도 시험하려면 `https://pivoxdata-git-*-seanbae-analysts-projects.vercel.app/auth/callback`)
   - 목록에 없는 주소는 오류 없이 Site URL 로 간다 — "로그인은 되는데 콜백을 안 탄다" 면 이것부터.
2. **Emails → SMTP**: Supabase 내장 발송기는 팀 구성원 주소로만 보낸다. PivoxMap 과 같은 Brevo 를 붙인다
   (보내는 사람 `no-reply@pivoxquant.com`, 이름 `AX 트렌드 레이더`). 붙였으면 `AUTH.mail = "brevo"` — 처리방침의 국외 이전 표에 Brevo 가 들어간다.
3. **Emails → Templates**: **Magic Link** 와 **Confirm signup** 두 템플릿을 이 폴더의 `magic-link.html` · `confirm-signup.html` 로 바꾼다.
   제목은 `AX 트렌드 레이더 로그인 링크` · `AX 트렌드 레이더 시작하기 — 로그인 링크`.
   - 링크는 `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` 그대로 — 휴대폰 메일 앱(다른 브라우저)에서 열어도 된다.
     기본 템플릿이면 `?code=` 로 와서 요청한 브라우저에서만 열린다(`callback.js` 가 "로그인을 요청한 브라우저에서 열어 주세요" 라고 말한다).
   - 처음 쓰는 주소는 Magic Link 가 아니라 Confirm signup 메일을 받는다 — 둘 다 바꾼다.

## 3. 사이트에 넣기

`trends/site.mjs` → `AUTH` 에 `url`(`https://<ref>.supabase.co`) · `key`(Settings → API Keys 의 **publishable** 키 `sb_publishable_…` —
공개돼도 되는 키다. secret · service_role 키는 절대 넣지 않는다) · `region`(처리방침에 적을 서버 위치, 예: `미국 (us-west-1)`)을 적고
`npm run trends:build && node social/briefs.mjs` 로 페이지를 다시 만든 뒤 커밋한다. 다음 날부터는 매일 실행이 같은 값으로 만든다.

## 4. 켠 뒤 확인

1. 새 창에서 `/` → 표지 → 소개 → 시작하기 → `/login` → 메일 → 동의 세 개 → 메일함 화면.
2. 메일의 버튼 → `/auth/callback` 이 "로그인했어요 · 이메일" — 링크 주소에 `token_hash=` 가 있어야 한다. 휴대폰 메일 앱에서도.
3. 브리핑에서 저장 → `/saved` 에 보이고, 다른 기기에서 같은 메일로 로그인하면 같은 목록.
4. `/saved` → 계정 → 탈퇴(메일 주소 입력) → 다시 로그인하면 새 계정이고 목록이 비어 있다.

로컬에서는 Supabase 없이 시험한다: `PD_AUTH_URL` · `PD_AUTH_KEY` 로 가짜 서버를 가리켜 페이지를 만들고(`trends/site.mjs`),
그 서버가 `/auth/v1/otp` · `/verify` · `/token` · `/logout` · `/rest/v1/rpc/pd_*` 에 답하게 한다(2026-10-26 이 방식으로 흐름 전체를 확인했다).
