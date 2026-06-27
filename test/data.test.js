import { test } from "node:test";
import assert from "node:assert/strict";
import { ANSWERS } from "../src/data/answers.js";
import { VALID } from "../src/data/valid.js";

test("every answer is also an accepted guess (ANSWERS ⊆ VALID)", () => {
  const missing = ANSWERS.filter((w) => !VALID.has(w));
  assert.deepEqual(
    missing,
    [],
    `${missing.length} answer(s) missing from VALID: ${missing.slice(0, 20).join(", ")}`,
  );
});

test("all words are lowercase, accent-free, 5 letters a-z", () => {
  const badAnswers = ANSWERS.filter((w) => !/^[a-z]{5}$/.test(w));
  assert.deepEqual(badAnswers, [], `malformed answers: ${badAnswers.slice(0, 20).join(", ")}`);
  const badValid = [...VALID].filter((w) => !/^[a-z]{5}$/.test(w));
  assert.deepEqual(badValid, [], `malformed valid words: ${badValid.slice(0, 20).join(", ")}`);
});

test("ANSWERS has no duplicate entries", () => {
  assert.equal(new Set(ANSWERS).size, ANSWERS.length);
});

test("both lists are non-empty", () => {
  assert.ok(ANSWERS.length > 0);
  assert.ok(VALID.size > 0);
});

// Content guards. ANSWERS/VALID are regenerated from the wordlists/ submodule,
// so a source update could silently reintroduce words we deliberately curated
// out. These lists are kept in sync by hand with the curated removal files
// (wordlists/pt-br/curated/common-removals.txt and valid-removals.txt); they're
// duplicated here on purpose so `npm test` stays self-contained (no submodule
// needed). If you intentionally allow one of these, remove it from both places.

// Vulgar/sexual words: fine as accepted guesses, but must never be a daily
// answer (the "palavra do dia" is shown to everyone on the same day).
const BLOCKED_ANSWERS = [
  "bosta",
  "bunda",
  "cagar",
  "coito",
  "corno",
  "debil",
  "gozar",
  "merda",
  "peido",
  "penis",
  "porno",
  "porra",
  "pubis",
  "putos",
  "tesao",
  "tetas",
  "vadio",
  "vulva",
];

// Identity-based slurs: must not even be accepted as a guess.
const BLOCKED_VALID = ["viado", "bicha"];

test("no blocked vulgar words in ANSWERS", () => {
  const answerSet = new Set(ANSWERS);
  const leaked = BLOCKED_ANSWERS.filter((w) => answerSet.has(w));
  assert.deepEqual(leaked, [], `blocked words back in ANSWERS: ${leaked.join(", ")}`);
});

test("no slurs accepted as guesses (VALID)", () => {
  const leaked = BLOCKED_VALID.filter((w) => VALID.has(w));
  assert.deepEqual(leaked, [], `slurs back in VALID: ${leaked.join(", ")}`);
});
