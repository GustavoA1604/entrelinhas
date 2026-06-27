import { VALID } from "./data/valid.js";

// Alphabetic sentinels bounding the whole dictionary.
export const SENTINEL_LOW = "aaaaa";
export const SENTINEL_HIGH = "zzzzz";

// Sorted array of valid words for distance and range queries.
export const VALID_SORTED = [...VALID].sort();

export function stripAccents(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}
export function normalize(s) {
  return stripAccents(s).toLowerCase().trim();
}

// Binary search: first index i where arr[i] >= x
function lowerBoundIdx(arr, x) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}
// Binary search: first index i where arr[i] > x
function upperBoundIdx(arr, x) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

// Number of dictionary steps between two words (1 = adjacent). 0 when a >= b.
export function distanceBetween(a, b) {
  if (!(a < b)) return 0;
  const i = upperBoundIdx(VALID_SORTED, a);
  const j = lowerBoundIdx(VALID_SORTED, b);
  return Math.max(0, j - i) + 1;
}

export function pluralWords(n) {
  return n === 1 ? "1 palavra" : `${n.toLocaleString("pt-BR")} palavras`;
}

// Could a 5-letter word whose first letters are exactly `prefix` still fall
// inside the open gap `(gLo, gHi)`? Compares the prefix's lexicographic span
// (padded with a..z) against the exclusive bounds.
export function prefixFitsGap(prefix, gLo, gHi) {
  const k = prefix.length;
  if (k > 5) return false;
  const lo = prefix + "a".repeat(5 - k);
  const hi = prefix + "z".repeat(5 - k);
  return hi > gLo && lo < gHi;
}

// Could a 5-letter word starting with `prefix + c` still fall inside any of the
// open `gaps` (each an exclusive [lo, hi] bound pair)? Powers the alphabet hint
// that greys out letters which can no longer lead to a valid guess.
export function prefixFitsGaps(prefix, c, gaps) {
  if (prefix.length >= 5) return false;
  const p = prefix + c;
  return gaps.some(([gLo, gHi]) => prefixFitsGap(p, gLo, gHi));
}

// Longest prefix of `draft` (0..length) that could still land inside the open
// gap (gLo, gHi). Because a fitting longer prefix implies its shorter prefixes
// also fit, the fitting lengths form a run 0..len, so we stop at the first miss.
// A draft whose returned length is < draft.length overruns the gap from that
// position on; both game modes use that to flag the offending squares red.
export function fitPrefixLen(draft, gLo, gHi) {
  let len = 0;
  for (let L = 1; L <= draft.length; L++) {
    if (prefixFitsGap(draft.slice(0, L), gLo, gHi)) len = L;
    else break;
  }
  return len;
}
