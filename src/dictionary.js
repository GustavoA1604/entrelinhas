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

// Could a 5-letter word starting with `prefix + c` still fall inside any of the
// open `gaps` (each an exclusive [lo, hi] bound pair)? Powers the alphabet hint
// that greys out letters which can no longer lead to a valid guess.
export function prefixFitsGaps(prefix, c, gaps) {
  const k = prefix.length;
  if (k >= 5) return false;
  const pad = 5 - k - 1;
  const lo = prefix + c + "a".repeat(pad);
  const hi = prefix + c + "z".repeat(pad);
  for (const [gLo, gHi] of gaps) {
    if (hi > gLo && lo < gHi) return true;
  }
  return false;
}
