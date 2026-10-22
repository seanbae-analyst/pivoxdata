// lang.mjs — the one switch for display language (English / 한국어).
// Messages built by scorer/fixer/analyzer/insights go through L(en, ko). English is the
// default, so Node (validate.mjs, sim.mjs, cli.mjs) sees exactly the strings it always did;
// the browser calls setLang() before scoring. Codes, evidence and numbers never change
// with the language — only the sentence a person reads.
let current = "en";

export const setLang = (lang) => { current = lang === "ko" ? "ko" : "en"; };
export const getLang = () => current;
export const L = (en, ko) => (current === "ko" ? ko : en);

// PII type names as a person reads them (the code stays "email" / "phone" / "ssn")
export const piiName = (type) =>
  L(type, { email: "이메일", phone: "전화번호", ssn: "미국 사회보장번호(SSN)" }[type] || type);
