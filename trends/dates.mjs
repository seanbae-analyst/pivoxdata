// dates.mjs — day and month arithmetic for fetch, verify, build and signals: dates are UTC "YYYY-MM-DD" strings,
// months "YYYYMM" (arXiv) or "YYYY-MM" (Ramp AI Index).
export const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// n months later (earlier when negative), spelt like `m`
export const addMonths = (m, n) => {
  const dash = m[4] === "-", t = +m.slice(0, 4) * 12 + +m.slice(dash ? 5 : 4, dash ? 7 : 6) - 1 + n;
  return `${Math.floor(t / 12)}${dash ? "-" : ""}${String((t % 12) + 1).padStart(2, "0")}`;
};
// the last month that has ended by `day`, as "YYYYMM"
export const lastFullMonth = (day) => addMonths(day.slice(0, 7).replace("-", ""), -1);
