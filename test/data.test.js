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
