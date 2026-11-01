// apply-templates.mjs — puts this folder's two sign-in e-mails into the Supabase project's Auth settings (2026-11-01,
// owner: "너가 직접해" → B): the Management API (PATCH /v1/projects/<ref>/config/auth) with a personal access token, so
// a template changed here reaches the e-mails without the dashboard. Run by .github/workflows/auth-templates.yml.
// It sets the subject and the body of Magic Link and Confirm signup — nothing else in the project's Auth settings —
// then reads them back and compares. The token is never printed.
//
// Usage: SUPABASE_ACCESS_TOKEN=… node supabase/apply-templates.mjs [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH } from "../trends/site.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REF = new URL(AUTH.url).hostname.split(".")[0];
// the subjects (supabase/README.md → 2. Authentication 설정 → Templates)
const WANT = {
  mailer_subjects_magic_link: "AX 트렌드 레이더 로그인 코드",
  mailer_templates_magic_link_content: fs.readFileSync(path.join(DIR, "magic-link.html"), "utf8"),
  mailer_subjects_confirmation: "AX 트렌드 레이더 시작하기 — 로그인 코드",
  mailer_templates_confirmation_content: fs.readFileSync(path.join(DIR, "confirm-signup.html"), "utf8"),
};
// code only since 2026-11-01: a template that lost the code, or still carries a link, is not sent
for (const k of ["mailer_templates_magic_link_content", "mailer_templates_confirmation_content"]) {
  if (!WANT[k].includes("{{ .Token }}")) throw new Error(`${k}: no {{ .Token }} — the e-mail would have no code`);
  if (/TokenHash|ConfirmationURL/.test(WANT[k])) throw new Error(`${k}: still has a link — sign-in is code only`);
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (process.argv.includes("--dry-run") || !token) {
  console.log(`${token ? "dry run" : "no SUPABASE_ACCESS_TOKEN"} — would set on ${REF}:`);
  for (const [k, v] of Object.entries(WANT)) console.log(`  ${k}: ${k.includes("subjects") ? v : `${v.length} chars`}`);
  process.exit(token ? 0 : 1);
}
const api = (method, body) => fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const res = await api("PATCH", WANT);
if (!res.ok) throw new Error(`PATCH config/auth: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
const now = await (await api("GET")).json();
const off = Object.keys(WANT).filter((k) => now[k] !== WANT[k]);
if (off.length) throw new Error(`set, but reads back different: ${off.join(", ")}`);
console.log(`${REF}: Magic Link and Confirm signup set — subjects "${WANT.mailer_subjects_magic_link}" · "${WANT.mailer_subjects_confirmation}", the code only`);
