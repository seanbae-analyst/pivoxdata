# 로그인 켜기 (Supabase, 2026-10-26)

로그인은 `trends/site.mjs` → `AUTH`의 `url` · `key`로 켜진다(비어 있으면 로그인은 어디에도 없다 — 메뉴 · 소개 다음의 로그인 단계 ·
처리방침의 로그인 절). 흐름과 이유는 `docs/decisions.md` 23번.

## 0. 프로젝트 — PivoxQuant 프로젝트를 같이 쓴다 (소유자 2026-10-26)

`pivoxquant`(ref `yjiztgummaxecriiuumt`, 서울 ap-northeast-2). Supabase 무료 프로젝트 2개가 PivoxMap · PivoxQuant로 차 있어서다.
- 같이 쓰기 전에 잰 것(2026-10-26): public 표 53개(주인 `pivox_app`)에 anon · authenticated · PUBLIC 권한 0, public 함수 0,
  저장소 버킷 0, `auth.users` 0명, 공개 키로 `GET /rest/v1/users` · `/investment_profiles` → 401 `42501`.
  공개 키는 사이트 HTML에 실리므로, PivoxQuant 표에 anon · authenticated 권한을 주는 변경이 생기면 그 표가 열린다 — 그쪽에서 권한을 줄 땐 이걸 같이 본다.
- 같이 쓰는 것: 로그인 사용자 목록(`auth.users`), 메일 설정(SMTP · 템플릿), 사이트 주소. PivoxQuant는 Supabase 로그인을 쓰지 않는다
  (그 저장소에 supabase-js · `/auth/v1` 없음, `auth.users` 0명).

## 1. 스키마

`supabase/schema.sql` 을 그 프로젝트에서 한 번 돌린다(SQL editor, 또는 Supabase MCP `apply_migration`). 다시 돌려도 바뀌는 게 없다.
- 표는 `pivoxdata` 스키마에 있고 REST 에 열지 않는다. 브라우저는 `public.pd_*` 함수로만 닿고, 함수마다 **부른 사람 자기 행만** 읽고 쓴다.
- 확인: publishable 키로 `POST /rest/v1/rpc/pd_saved_list` 를 로그인 없이 부르면 401 이어야 한다.

### 운영자 (2026-10-27)

`/upload`(긴 이야기 카드를 폰으로 받아 인스타 앱에 직접 올리는 화면)는 로그인한 **운영자**만 쓴다. 운영자 확인은
`public.pd_is_operator()`(로그인한 사람의 토큰 메일이 `pivoxdata.operators`에 있나)가 한다. 메일 주소는 이 공개 저장소에 적지 않고
SQL editor(또는 Supabase MCP `execute_sql`)로 넣는다: `insert into pivoxdata.operators (email) values ('<소문자 메일>');`
빼기는 `delete from pivoxdata.operators where email = '<메일>';`. 카드 이미지와 캡션 파일 자체는 공개다(인스타가 주소로 가져간다) —
막는 건 도구이지 카드가 아니다.

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
   - 두 템플릿에는 **로그인 코드 `{{ .Token }}`** 이 있다(2026-10-27): `/login` 의 코드 칸에 넣으면 그 화면에서 바로 로그인된다
     (`auth.js` → `verifyCode`, `POST /auth/v1/verify {type:"email", email, token}`). 휴대폰 메일 앱의 링크는 브라우저로 열리고 홈 화면 앱으로는
     못 가기 때문이다(아이폰은 홈 화면 앱이 링크를 받지 못한다). 템플릿에 코드가 없으면 메일에 코드가 안 보인다 — 대시보드에 붙였는지부터 본다.

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
