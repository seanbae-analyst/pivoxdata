// slot.mjs — a post's folder name under social/out/: its date, then -2, -3 … for a later post the same day (-91 … for
// the hand-made pinned posts). Ordered as a date and then a number, so 2026-10-25-10 comes after 2026-10-25-2 (a string
// sort puts it first). The workflows match the same shape (social-publish.yml: SLOT in "Which post"); keep them alike.
export const SLOT = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;
export const isSlot = (s) => SLOT.test(String(s));
export const parseSlot = (s) => { const m = SLOT.exec(String(s)); return m ? { date: m[1], n: m[2] ? +m[2] : 1 } : null; };
// for sort(): oldest first; a name that is not a slot (roundup-2026-10) after every slot, by name
export function compareSlots(a, b) {
  const x = parseSlot(a), y = parseSlot(b);
  if (!x || !y) return x ? -1 : y ? 1 : String(a).localeCompare(String(b));
  return x.date.localeCompare(y.date) || x.n - y.n;
}
// the first folder free for a post on `date`: the date itself, then -2, -3 …
export const nextSlot = (date, taken) => { let slot = date; for (let n = 2; taken(slot); n++) slot = `${date}-${n}`; return slot; };
