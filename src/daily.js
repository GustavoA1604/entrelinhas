// Daily-puzzle date keys and the seeded RNG used to derive each day's puzzle.

// Anchor daily puzzles to Brasília time (UTC-3, no DST) so every device
// generates the same date key for the same UTC instant.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function todayKey() {
  const d = new Date(Date.now() - BRT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function formatDate(key) {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// All date keys from `today` back to `epoch` (inclusive), newest first.
export function listDateKeys(epoch, today) {
  const start = parseDateKey(epoch);
  const end = parseDateKey(today);
  const out = [];
  for (let t = end; t >= start; t -= 86400000) {
    const d = new Date(t);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

// Short, clipboard/URL-friendly token used to seed (and share) a random game.
export function makeSeed() {
  return (Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6)).slice(
    0,
    8,
  );
}

export function seededRng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
