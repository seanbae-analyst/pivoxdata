// series.mjs — every ECOS series the lab charts, in one place.
// A series is one (table, item, cycle). `agency` is who compiled the number; ECOS re-publishes it.
// Flows (순매수) and balances (잔고) are kept apart because they aggregate differently:
// a year of flows is the sum of its months, a year-end balance is one month's value.

export const TABLES = {
  "901Y055": { name: "1.5.1.3 투자자별 주식거래", agency: "한국거래소" },
  "901Y056": { name: "1.5.1.4 증시주변자금동향", agency: "금융투자협회" },
  "901Y014": { name: "1.5.1.2 주식시장(월,년)", agency: "한국거래소" },
};

const NB = (id, code, label) => ({ id, table: "901Y055", items: [code, "VA"], cycle: "M", start: "200401", kind: "flow", unit: "백만원", label });
const FUND = (id, code, label) => ({ id, table: "901Y056", items: [code], cycle: "M", start: "199806", kind: "balance", unit: "원", label });

export const SERIES = [
  NB("netbuy_individual", "S22CB", "개인 순매수 거래대금"),
  NB("netbuy_institution", "S22CA", "기관투자자 순매수 거래대금"),
  NB("netbuy_foreign", "S22CC", "외국인 순매수 거래대금"),
  NB("netbuy_other_foreign", "S22CD", "기타외국인 순매수 거래대금"),
  NB("netbuy_other_corp", "S22CF", "기타법인 순매수 거래대금"),
  NB("buy_total", "S22B", "매수 거래대금 합계"),
  FUND("deposits", "S23A", "투자자 예탁금"),
  FUND("unpaid", "S23D", "위탁매매 미수금"),
  FUND("credit", "S23E", "신용융자 잔고"),
  FUND("short_credit", "S23F", "신용대주 잔고"),
  { id: "mcap_kospi", table: "901Y014", items: ["1040000"], cycle: "M", start: "200501", kind: "balance", unit: "천원", label: "KOSPI 시가총액" },
  { id: "kospi_value", table: "901Y014", items: ["1060000"], cycle: "M", start: "200501", kind: "flow", unit: "천원", label: "KOSPI 거래대금" },
  { id: "kospi_close", table: "901Y014", items: ["1070000"], cycle: "M", start: "200002", kind: "level", unit: "1980.01.04=100", label: "KOSPI 종가" },
  { id: "mcap_kosdaq", table: "901Y014", items: ["2040000"], cycle: "M", start: "200401", kind: "balance", unit: "천원", label: "KOSDAQ 시가총액" },
];

// Annual (A) versions, used only by verify.mjs as an independent second reading of the same numbers.
export const ANNUAL = [
  { id: "netbuy_individual_A", of: "netbuy_individual", table: "901Y055", items: ["S22CB", "VA"], cycle: "A", start: "2004" },
  { id: "credit_A", of: "credit", table: "901Y056", items: ["S23E"], cycle: "A", start: "1998" },
  { id: "deposits_A", of: "deposits", table: "901Y056", items: ["S23A"], cycle: "A", start: "1998" },
];
