import { NEWS } from "../trends/series.mjs";
// tags.mjs — how the briefings are organized: a series per kind of post, and tags from fixed lists only, so the
// archive never fills with near-duplicates ("정책", "규제", "정책·규제"). story.mjs asks Claude to pick themes and
// industries from these lists (anything else is dropped); companies come from the announcements a post used.
export const SERIES = {
  news: { name: "이번 주 AX 사건", about: "회사·정부가 직접 낸 공식 발표로 보는 한 주의 AX" },
  monthly: { name: "월간 AX 리포트", about: "Ramp AI Index로 보는 미국 기업의 AI 도입, 매달" },
  breaking: { name: "빅 케이스", about: "평소와 크게 다른 일이 생긴 날" },
  tools: { name: "누가 앞서나", about: "분야마다 기업·개발자가 실제로 고르는 AI 도구" },
  weekly: { name: "이번 주 정리", about: "한 주 동안 잡힌 작은 변화" },
  roundup: { name: "월간 정리", about: "한 달 동안의 브리핑을 한 편으로" },
  flow: { name: "AX 흐름", about: "특별한 사건 없는 날의 요즘 숫자" },
};
const AX_FORMATS = new Set(["monthly", "deepdive", "timeline"]);
// which series a story belongs to (story.json: mode, format, topic)
export function seriesOf(st) {
  if (st.mode === "roundup-month") return "roundup";
  if (st.mode === "news") return "news";
  if (st.mode === "race") return "tools";
  if (st.mode === "digest") return "weekly";
  if (st.mode === "event") return st.topic === "ax" && AX_FORMATS.has(st.format) ? "monthly" : "breaking";
  return "flow";
}

export const THEMES = [
  { id: "adoption", name: "도입 사례" }, { id: "deal", name: "인수·투자·제휴" }, { id: "policy", name: "정책·규제" },
  { id: "infra", name: "인프라·클라우드" }, { id: "security", name: "보안·안전" }, { id: "work", name: "일하는 방식" },
  { id: "data", name: "데이터" }, { id: "tools", name: "개발 도구" }, { id: "models", name: "AI 모델" }, { id: "spend", name: "AI 지출" },
];
export const INDUSTRIES = [
  { id: "tech", name: "IT·기술" }, { id: "finance", name: "금융·보험" }, { id: "manufacturing", name: "제조" },
  { id: "retail", name: "소매·유통" }, { id: "construction", name: "건설" }, { id: "healthcare", name: "의료·바이오" },
  { id: "hospitality", name: "숙박·외식" }, { id: "public", name: "공공·정부" }, { id: "telecom", name: "통신" },
  { id: "media", name: "미디어·광고" }, { id: "education", name: "교육" }, { id: "legal", name: "법률·전문서비스" },
  { id: "mobility", name: "모빌리티·물류" }, { id: "energy", name: "에너지" },
];
// a company tag's id: the official source's id in trends/series.mjs (NEWS), so URLs stay ASCII (영국 정부 → ukgov);
// any other name: lower-cased letters and digits
export const companyId = (name) => NEWS.sources.find((x) => x.name === name)?.id.replace(/-source$/, "") ?? (String(name).toLowerCase().replace(/[^0-9a-z]+/g, "-").replace(/^-|-$/g, "") || "org");
export const tagPrompt = () => `태그는 아래 목록에서만 고른다(목록에 없는 말은 버려진다).
- themes(주제, 1~3개): ${THEMES.map((t) => t.name).join(" / ")}
- industries(업종, 0~3개, 글이 특정 업종을 다룰 때만): ${INDUSTRIES.map((t) => t.name).join(" / ")}`;
// Claude's picks → ids from the lists; unknown names are dropped
export const pickTags = (names, list, max) => [...new Set((Array.isArray(names) ? names : []).map((n) => list.find((t) => t.name === String(n).trim() || t.id === String(n).trim())?.id).filter(Boolean))].slice(0, max);
