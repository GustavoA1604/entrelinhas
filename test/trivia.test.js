import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTrivia, LONGTAIL_CHANCE } from "../src/trivia.js";
import { WRITING_RULES, GAME_RULES } from "../src/data/trivia-curated.js";
import { STATS_HIGHLIGHTS, STATS_LONGTAIL, STATS_GAME } from "../src/data/trivia-stats.js";

// A scripted rand() that returns each queued value in turn, so we can steer
// pickTrivia down a specific branch deterministically.
const scripted = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

test("bucket 0 → a writing rule", () => {
  // first rand() picks bucket (0), second indexes into the array (0)
  assert.equal(pickTrivia(scripted(0, 0)), WRITING_RULES[0]);
});

test("bucket 1 above the long-tail chance → a highlight", () => {
  // bucket=1, then rand() >= LONGTAIL_CHANCE selects highlights, then index 0
  assert.equal(pickTrivia(scripted(0.34, 0.99, 0)), STATS_HIGHLIGHTS[0]);
});

test("bucket 1 below the long-tail chance → a long-tail fact", () => {
  assert.equal(pickTrivia(scripted(0.34, LONGTAIL_CHANCE / 2, 0)), STATS_LONGTAIL[0]);
});

test("bucket 2 → curated game rules then generated stats", () => {
  const combined = [...GAME_RULES, ...STATS_GAME];
  assert.equal(pickTrivia(scripted(0.67, 0)), combined[0]);
  // last entry of the combined pool (a generated corpus-size fact)
  assert.equal(pickTrivia(scripted(0.67, 0.9999)), combined[combined.length - 1]);
});

test("always returns a non-empty string for random inputs", () => {
  for (let i = 0; i < 500; i++) {
    const fact = pickTrivia(Math.random);
    assert.equal(typeof fact, "string");
    assert.ok(fact.length > 0);
  }
});
