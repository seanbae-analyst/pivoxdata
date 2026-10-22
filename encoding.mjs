// encoding.mjs — bytes → text, shared by the browser (index.html) and the Node CLI (parse.mjs).
//
// Korean public-data downloads are very often CP949 (a.k.a. EUC-KR / UHC). Reading them as
// UTF-8 silently turns every Hangul cell into mojibake, and the scorer then grades garbage.
// Order of evidence, strongest first — and never a silent guess:
//   1. a byte-order mark (UTF-8 / UTF-16) is definitive
//   2. bytes that decode as strict UTF-8 are UTF-8
//   3. bytes that decode as CP949 with ZERO invalid sequences are CP949 → the caller shows a notice
//   4. anything else is decoded as UTF-8 with U+FFFD for the unreadable bytes, reported as lossy
//      (the scorer then raises an "unreadable text" fact on the affected cells/headers)
//
// Why a hand-built extension table: WHATWG TextDecoder("euc-kr") — what browsers ship — is full
// CP949. Node's ICU-backed decoder for the same label only covers KS X 1001 (2,350 Hangul) and
// maps UHC extension bytes such as 0x8C 0x63 ("똠") to C1 control characters WITHOUT a U+FFFD
// (measured on Node 22.22 / ICU 77.1). The UHC extension is algorithmic: its codes, in order,
// are exactly the 8,822 Hangul syllables missing from KS X 1001, in Unicode order — so the
// table is derived, not pasted. validate.mjs §11 cross-checks it against a committed fixture.

export const REPLACEMENT = "�";

let nativeFull = null; // does this runtime's TextDecoder("euc-kr") implement the UHC extension?
function nativeEucKrIsFull() {
  if (nativeFull === null) {
    try { nativeFull = new TextDecoder("euc-kr").decode(new Uint8Array([0x8c, 0x63])) === "똠"; }
    catch { nativeFull = false; }
  }
  return nativeFull;
}

let EXT = null; // (lead<<8|trail) → UHC extension syllable
let KS = null;  // (lead<<8|trail) → KS X 1001 character, via the runtime decoder
function buildTables() {
  if (EXT) return;
  const dec = new TextDecoder("euc-kr");
  KS = new Map();
  for (let lead = 0xa1; lead <= 0xfe; lead++) {
    for (let trail = 0xa1; trail <= 0xfe; trail++) {
      const s = dec.decode(new Uint8Array([lead, trail]));
      // accept exactly one non-control, non-private-use character; anything else is
      // unassigned (rows 0xC9/0xFE are the user-defined area — WHATWG rejects them too)
      const c = s.charCodeAt(0);
      if (s.length === 1 && s !== REPLACEMENT && c >= 0xa0 && !(c >= 0xe000 && c <= 0xf8ff)) KS.set((lead << 8) | trail, s);
    }
  }
  // CP949 additions to the KS X 1001 symbol row (€ ®) that ICU's table lacks. (0xA2E8 ㉾ is
  // left out: neither Chromium nor Python's cp949 maps it — parity with the browser wins.)
  KS.set(0xa2e6, "€"); KS.set(0xa2e7, "®");
  const inKs = new Set(KS.values());
  const missing = [];
  for (let cp = 0xac00; cp <= 0xd7a3; cp++) {
    const ch = String.fromCharCode(cp);
    if (!inKs.has(ch)) missing.push(ch);
  }
  EXT = new Map();
  let k = 0;
  outer: for (let lead = 0x81; lead <= 0xc6; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      const isLetter = (trail >= 0x41 && trail <= 0x5a) || (trail >= 0x61 && trail <= 0x7a);
      const isHigh = trail >= 0x81 && (lead <= 0xa0 ? trail <= 0xfe : trail <= 0xa0);
      if (!isLetter && !isHigh) continue;
      if (k >= missing.length) break outer;
      EXT.set((lead << 8) | trail, missing[k++]);
    }
  }
}

// CP949 byte walker (used only where the native decoder lacks the extension, i.e. Node)
// (every CP949 character is in the BMP, so the output is built as UTF-16 code units)
function decodeCp949Walk(bytes) {
  buildTables();
  const out = new Uint16Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) { out[n++] = b; continue; }
    if (b >= 0x81 && b <= 0xfe && i + 1 < bytes.length) {
      const code = (b << 8) | bytes[i + 1];
      const ch = EXT.get(code) ?? KS.get(code);
      if (ch) { out[n++] = ch.charCodeAt(0); i++; continue; }
      // WHATWG: an invalid pair whose trail is ASCII emits U+FFFD and re-reads the trail
      out[n++] = 0xfffd;
      if (bytes[i + 1] >= 0x80) i++;
      continue;
    }
    out[n++] = 0xfffd;
  }
  return new TextDecoder("utf-16le").decode(out.subarray(0, n));
}

export function decodeCp949(bytes) {
  return nativeEucKrIsFull() ? new TextDecoder("euc-kr").decode(bytes) : decodeCp949Walk(bytes);
}

const stripBOM = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

// bytes: Uint8Array | ArrayBuffer | Node Buffer
// → { text, encoding: "utf-8" | "utf-16le" | "utf-16be" | "cp949" | "unknown", lossy }
export function decodeBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: stripBOM(new TextDecoder("utf-8").decode(bytes.subarray(3))), encoding: "utf-8", lossy: false };
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: stripBOM(new TextDecoder("utf-16le").decode(bytes.subarray(2))), encoding: "utf-16le", lossy: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: stripBOM(new TextDecoder("utf-16be").decode(bytes.subarray(2))), encoding: "utf-16be", lossy: false };
  try {
    return { text: stripBOM(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), encoding: "utf-8", lossy: false };
  } catch { /* not UTF-8 — try CP949 below */ }
  const cp = decodeCp949(bytes);
  if (!cp.includes(REPLACEMENT)) return { text: cp, encoding: "cp949", lossy: false };
  return { text: stripBOM(new TextDecoder("utf-8").decode(bytes)), encoding: "unknown", lossy: true };
}
