// claude.mjs — the two ways social/ reaches Claude, shared by story.mjs (the storyline) and caption.mjs:
//  • CLAUDE_CODE_OAUTH_TOKEN — a Claude subscription token from `claude setup-token`, used through the Claude Code
//    CLI (`claude -p`): nothing to pay beyond the subscription (it shares its usage limits);
//  • ANTHROPIC_API_KEY — an API key, used through the SDK and billed per use.
// `pickRoute()` says which is set up; `ask(route, system, messages)` returns { text, model } or { refusal }, and throws
// ClaudeUnavailable when Claude can't be reached (missing CLI, bad token, API error) so callers can fall back.
import os from "node:os";
import { spawnSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
export class ClaudeUnavailable extends Error {}

export const pickRoute = () => (process.env.CLAUDE_CODE_OAUTH_TOKEN ? "Claude Code" : process.env.ANTHROPIC_API_KEY ? "API" : null);

export async function ask(route, system, messages) {
  return route === "Claude Code" ? viaClaudeCode(system, messages) : viaApi(system, messages);
}

async function viaApi(system, messages) {
  try {
    const res = await new Anthropic().beta.messages.create({
      model: MODEL, max_tokens: 16000, system, messages,
      output_config: { effort: "medium" },
      // if a safety classifier declines, the API re-runs the request on Anthropic's recommended fallback model
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return { refusal: res.stop_details?.category ?? "unknown" };
    return { text: res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim(), model: res.model };
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new ClaudeUnavailable(`API error ${e.status}: ${e.message}`);
    throw e;
  }
}

function viaClaudeCode(system, messages) {
  // `claude -p` takes one prompt, so a retry carries the earlier draft inside it. No tools, no saved session, and it
  // runs outside the repository so it never picks up project files as context.
  const prompt = messages.map((m) => (m.role === "user" ? m.content : `(직전에 네가 쓴 답)\n${m.content}`)).join("\n\n");
  const r = spawnSync("claude", ["-p", "--output-format", "json", "--model", MODEL, "--system-prompt", system, "--tools", "", "--no-session-persistence"],
    // a token copied from a terminal often carries a line break; any whitespace in it makes the header invalid
    { input: prompt, encoding: "utf8", cwd: os.tmpdir(), timeout: 600_000, maxBuffer: 1 << 24,
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").replace(/\s+/g, "") } });
  if (r.error) throw new ClaudeUnavailable(`Claude Code: ${r.error.code === "ENOENT" ? "claude CLI not installed" : r.error.message}`);
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new ClaudeUnavailable(`Claude Code: exit ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`); }
  if (out.is_error) throw new ClaudeUnavailable(`Claude Code: ${String(out.result ?? out.terminal_reason ?? "error").slice(0, 300)}`);
  if (out.stop_reason === "refusal") return { refusal: "claude code" };
  return { text: String(out.result ?? "").trim(), model: Object.keys(out.modelUsage ?? {})[0] ?? MODEL };
}

// ---------- the checks every published word goes through ----------
// no advice or forecast words; numbers only from the facts the post was given
export const BANNED = /(추천|조언|매수|매도|사세요|사야|팔아|파세요|오를\s?것|내릴\s?것|오를지|급등|폭등|폭락|전망|예상|예측|목표가|무조건|보장|대박|BUY|SELL|HOLD)/gi;
export const numbersIn = (s) => (String(s).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ""));
// whatever comes back is posted as is, so a note to us ("--- 둘째 줄은 제가 덧붙였어요") must not ride along
export const META = /(덧붙였|카드 데이터|팩트 목록|빼도 돼|본문만|캡션 본문|JSON)/;

// the AI-written tells a reader spots at once: stock phrases, and the same hedge closing every paragraph
export const CLICHE = /(눈여겨볼 만|주목할 만|시사하는 바|시사점|새로운 시대|패러다임|게임 ?체인저|본격화|가속화|의미심장|혁신적인 변화|하는 모습이에요|모습을 보여|흐름으로 볼 수 있어요|알아볼게요|살펴볼게요|함께 살펴)/g;
export const hedges = (t) => (String(t).match(/볼 수 있어요|읽을 수 있어요/g) ?? []).length;
export const STYLE = `- 기자처럼 쓴다: 구체적인 사실을 먼저, 짧은 평서문으로. 꾸밈말과 상투어를 쓰지 않는다("눈여겨볼 만해요", "주목할 만해요", "시사점", "새로운 시대", "패러다임", "게임 체인저", "본격화", "가속화", "~하는 모습이에요", "살펴볼게요" 같은 말 금지).
- 해석은 꼭 필요한 곳에만 짧게 한다. 문단마다 "~로 볼 수 있어요"로 끝내지 않는다(글 전체에서 두세 번 이하). 같은 맺음말을 되풀이하지 않는다.`;
