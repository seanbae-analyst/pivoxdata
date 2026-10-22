// lang.mjs — the one switch for display language (English / 한국어).
// Messages built by scorer/fixer/analyzer/insights go through L(en, ko). English is the
// default, so Node (validate.mjs, sim.mjs, cli.mjs) sees exactly the strings it always did;
// the browser calls setLang() before scoring. Codes, evidence and numbers never change
// with the language — only the sentence a person reads.
let current = "en";

export const setLang = (lang) => { current = lang === "ko" ? "ko" : "en"; };
export const getLang = () => current;
export const L = (en, ko) => (current === "ko" ? ko : en);

// PII type names as a person reads them (the code stays "email" / "phone" / "ssn" / …).
// English for the original three is the code itself, so existing Node output is unchanged.
const PII_NAMES = {
  email: ["email", "이메일"],
  phone: ["phone", "전화번호"],
  ssn: ["ssn", "미국 사회보장번호(SSN)"],
  kr_rrn: ["Korean resident/foreigner registration number", "주민등록번호/외국인등록번호"],
  bank_account: ["bank account number", "계좌번호"],
};
export const piiName = (type) => (PII_NAMES[type] ? L(...PII_NAMES[type]) : type);

// non-PII identifier kinds the scorer recognizes (labelled, never penalized)
export const idKindName = (kind) =>
  ({ kr_brn: L("business registration no.", "사업자등록번호") }[kind] || kind);
