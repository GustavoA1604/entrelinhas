// Pure logic for the crossword side list and hint distance.
//
// Every guessed word acts as an alphabetic delimiter, including solved secrets,
// whose position is known once revealed. Unsolved secrets are then counted within
// the gaps between consecutive delimiters, so solving a secret tightens the
// interval(s) shown for the words that remain.
import { SENTINEL_LOW, SENTINEL_HIGH, distanceBetween } from "./dictionary.js";

function buildBounds(guessWords) {
  return [SENTINEL_LOW, ...[...guessWords].sort(), SENTINEL_HIGH];
}

// Returns:
//   rows: [{ kind: 'sentinel-low' | 'sentinel-high' }
//        | { kind: 'group', count }
//        | { kind: 'guess', word, upDist, downDist, solved }]  // *Dist undefined when not shown
//   liveGaps: [[loExcl, hiExcl], ...] gaps that still contain unsolved secrets
//   unsolvedCount: number of unsolved secrets
export function computeCrosswordList({ secretsSorted, solvedSet, guessWords }) {
  const unsolvedSecrets = secretsSorted.filter((w) => !solvedSet.has(w));
  const bounds = buildBounds(guessWords);

  // Unsolved secrets strictly inside each gap (between bounds[i] and bounds[i+1]).
  const gapSecrets = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i],
      hi = bounds[i + 1];
    gapSecrets.push(unsolvedSecrets.filter((s) => s > lo && s < hi));
  }

  const rows = [{ kind: "sentinel-low" }];
  const liveGaps = [];

  for (let i = 0; i < bounds.length - 1; i++) {
    const inGap = gapSecrets[i];
    if (inGap.length > 0) {
      rows.push({ kind: "group", count: inGap.length });
      liveGaps.push([bounds[i], bounds[i + 1]]);
    }

    // Render the delimiter at bounds[i+1] (every bound except the final sentinel).
    if (i + 1 < bounds.length - 1) {
      const word = bounds[i + 1];
      const upGroup = gapSecrets[i]; // secrets above this delimiter
      const downGroup = gapSecrets[i + 1]; // secrets below this delimiter
      let upDist, downDist;
      if (upGroup.length > 0) {
        // nearest secret above is the largest one still below the delimiter
        upDist = distanceBetween(upGroup[upGroup.length - 1], word);
      }
      if (downGroup.length > 0) {
        downDist = distanceBetween(word, downGroup[0]);
      }
      rows.push({ kind: "guess", word, upDist, downDist, solved: solvedSet.has(word) });
    }
  }
  rows.push({ kind: "sentinel-high" });

  return { rows, liveGaps, unsolvedCount: unsolvedSecrets.length };
}

// Trim rows that carry no information, for a cleaner display.
export function pruneRows(rows) {
  // 1. Drop delimiter rows with no unsolved secrets on either side.
  let out = rows.filter((r) => !(r.kind === "guess" && r.upDist == null && r.downDist == null));
  // With no remaining groups (e.g. the puzzle is complete) the sentinels are
  // just empty bookends: show nothing rather than a stray AAAAA / ZZZZZ.
  if (!out.some((r) => r.kind === "group")) return [];
  // 2. Drop sentinel-low if not followed by a group.
  if (out.length >= 2 && out[0].kind === "sentinel-low" && out[1].kind !== "group") {
    out = out.slice(1);
  }
  // 3. Drop sentinel-high if not preceded by a group.
  if (
    out.length >= 2 &&
    out[out.length - 1].kind === "sentinel-high" &&
    out[out.length - 2].kind !== "group"
  ) {
    out = out.slice(0, -1);
  }
  return out;
}

// Total dictionary distance from every unsolved secret to its enclosing
// delimiters: the smaller it gets, the closer the player is. Used to gate hints.
export function totalUnsolvedDistance({ secretsSorted, solvedSet, guessWords }) {
  const bounds = buildBounds(guessWords);
  let total = 0;
  for (const secret of secretsSorted) {
    if (solvedSet.has(secret)) continue;
    let lo = SENTINEL_LOW,
      hi = SENTINEL_HIGH;
    for (let i = 0; i < bounds.length - 1; i++) {
      if (secret > bounds[i] && secret < bounds[i + 1]) {
        lo = bounds[i];
        hi = bounds[i + 1];
        break;
      }
    }
    total += distanceBetween(lo, secret) + distanceBetween(secret, hi);
  }
  return total;
}
