// pick.mjs — which insights make a carousel, in order (the rest stay on the site).
// Shared by build.mjs (slides) and caption.mjs (what the caption may talk about).
//  • event: the big case first, then the cards of its topic tab (it is about something; they give the context)
//  • digest: the week's small changes, biggest first
//  • race: the "누가 앞서나" tab — the races that moved most
//  • news: none — the weekly AX news post is written from the official announcements
//  • roundup: the radar's strongest AI cards
export const PICK = ["npm", "provider", "arxiv", "pypi", "capex", "hf", "accel"];
export const MAX = 5;
export function slidesFor(I, plan) {
  if (plan?.mode === "event") {
    const topic = I.topics.find((t) => t.id === plan.event.topic) ?? I.topics[0];
    return [plan.event.card, ...topic.insights.filter((x) => x.id !== plan.event.card.id)].slice(0, MAX);
  }
  if (plan?.mode === "digest") return plan.items.map((c) => c.card).slice(0, MAX);
  if (plan?.mode === "news") return []; // told from the announcements themselves (story.mjs), not from cards
  if (plan?.mode === "race") return (I.topics.find((t) => t.id === "race")?.insights ?? []).slice(0, MAX);
  return PICK.map((id) => I.insights.find((x) => x.id === id)).filter(Boolean).slice(0, MAX);
}
