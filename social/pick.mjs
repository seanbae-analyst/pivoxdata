// pick.mjs — which insights make the week's carousel, in order (the rest stay on the site).
// Shared by build.mjs (slides) and caption.mjs (what the caption may talk about).
export const PICK = ["npm", "provider", "arxiv", "pypi", "capex", "hf", "accel"];
export const MAX = 5;
export const picked = (insights) => PICK.map((id) => insights.find((x) => x.id === id)).filter(Boolean).slice(0, MAX);
