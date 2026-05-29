import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCrossword, NUM_SECRETS } from "../src/crossword.js";

// Rebuild the letter grid from a placement list, asserting that overlapping
// cells always agree. Returns { grid: Map<"x,y",letter>, cellsByWord }.
function buildGrid(placed) {
  const grid = new Map();
  for (const p of placed) {
    for (let i = 0; i < p.word.length; i++) {
      const cx = p.dir === "H" ? p.x + i : p.x;
      const cy = p.dir === "H" ? p.y : p.y + i;
      const key = `${cx},${cy}`;
      const existing = grid.get(key);
      if (existing !== undefined) {
        assert.equal(existing, p.word[i], `conflicting letters at ${key}`);
      }
      grid.set(key, p.word[i]);
    }
  }
  return grid;
}

function countCrossings(word, x, y, dir, grid) {
  // How many of this word's cells are shared with the rest of the grid.
  let shared = 0;
  for (let i = 0; i < word.length; i++) {
    const cx = dir === "H" ? x + i : x;
    const cy = dir === "H" ? y : y + i;
    // A cell is "shared" if another word also occupies it; the grid alone can't
    // tell us that, so connectivity is checked separately below.
    if (grid.has(`${cx},${cy}`)) shared++;
  }
  return shared;
}

test("daily seed produces exactly NUM_SECRETS five-letter words", () => {
  const { placed } = generateCrossword("crossword:2026-05-29");
  assert.equal(placed.length, NUM_SECRETS);
  for (const p of placed) {
    assert.match(p.word, /^[a-z]{5}$/);
    assert.ok(p.dir === "H" || p.dir === "V");
  }
});

test("placed words are unique", () => {
  const { placed } = generateCrossword("crossword:2026-05-29");
  const words = placed.map((p) => p.word);
  assert.equal(new Set(words).size, words.length);
});

test("overlapping cells always share the same letter", () => {
  const { placed } = generateCrossword("crossword:2026-05-29");
  // buildGrid throws if any overlap disagrees.
  assert.doesNotThrow(() => buildGrid(placed));
});

test("every word after the first intersects the existing layout (connected)", () => {
  const { placed } = generateCrossword("crossword:2026-05-29");
  const grid = new Map();
  // Place first word freely.
  const place = (p) => {
    for (let i = 0; i < p.word.length; i++) {
      const cx = p.dir === "H" ? p.x + i : p.x;
      const cy = p.dir === "H" ? p.y : p.y + i;
      grid.set(`${cx},${cy}`, p.word[i]);
    }
  };
  place(placed[0]);
  for (let n = 1; n < placed.length; n++) {
    assert.ok(
      countCrossings(placed[n].word, placed[n].x, placed[n].y, placed[n].dir, grid) >= 1,
      `word ${placed[n].word} does not cross the existing layout`,
    );
    place(placed[n]);
  }
});

test("generation is deterministic for a given seed", () => {
  const a = generateCrossword("crossword:2026-05-29").placed;
  const b = generateCrossword("crossword:2026-05-29").placed;
  assert.deepEqual(a, b);
});

test("different daily seeds yield different puzzles", () => {
  const a = generateCrossword("crossword:2026-05-29")
    .placed.map((p) => p.word)
    .join(",");
  const b = generateCrossword("crossword:2026-05-30")
    .placed.map((p) => p.word)
    .join(",");
  assert.notEqual(a, b);
});

test("generation succeeds across many seeds (no null / crash)", () => {
  for (let d = 1; d <= 60; d++) {
    const seed = `crossword:2026-06-${String(d).padStart(2, "0")}`;
    const r = generateCrossword(seed);
    assert.ok(
      r && Array.isArray(r.placed) && r.placed.length === NUM_SECRETS,
      `failed for ${seed}`,
    );
  }
});
