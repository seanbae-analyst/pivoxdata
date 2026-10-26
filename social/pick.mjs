// pick.mjs — which insights make a carousel, in order (the rest stay on the site).
// Shared by story.mjs and build.mjs (slides) and caption.mjs (what the caption may talk about).
//  • event: the big case first, then the cards of its topic tab (it is about something; they give the context)
//  • digest: the week's small changes, biggest first
//  • news: none — the weekly AX news post is written from the official announcements
//  • roundup: the AX cards and the busiest IT domains (ERP, CRM, cloud …)
export const MAX = 5;
export function slidesFor(I, plan) {
  if (plan?.mode === "event") {
    const topic = I.topics.find((t) => t.id === plan.event.topic) ?? I.topics[0];
    return [plan.event.card, ...topic.insights.filter((x) => x.id !== plan.event.card.id)].slice(0, MAX);
  }
  if (plan?.mode === "digest") return plan.items.map((c) => c.card).slice(0, MAX);
  if (plan?.mode === "news") return []; // told from the announcements themselves (story.mjs), not from cards
  // roundup (a quiet fortnight): the AX cards and the busiest IT domains — AX only on Instagram
  const tab = (id) => I.topics.find((t) => t.id === id)?.insights ?? [];
  return [...tab("ax").slice(0, 3), ...tab("domains").slice(0, 2)].slice(0, MAX);
}
