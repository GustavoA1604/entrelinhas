import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_SORTED,
  SENTINEL_LOW,
  SENTINEL_HIGH,
  normalize,
  stripAccents,
  distanceBetween,
  pluralWords,
  prefixFitsGaps,
} from "../src/dictionary.js";

test("VALID_SORTED is sorted ascending and non-empty", () => {
  assert.ok(VALID_SORTED.length > 0);
  for (let i = 1; i < VALID_SORTED.length; i++) {
    assert.ok(VALID_SORTED[i - 1] <= VALID_SORTED[i], `not sorted at ${i}`);
  }
});

test("sentinels bound the whole dictionary", () => {
  assert.ok(SENTINEL_LOW < VALID_SORTED[0]);
  assert.ok(SENTINEL_HIGH > VALID_SORTED[VALID_SORTED.length - 1]);
});

test("normalize strips accents, lowercases and trims", () => {
  assert.equal(normalize("  AÇÚCAR "), "acucar");
  assert.equal(normalize("Pìnço"), "pinco");
  assert.equal(stripAccents("ãéîõü"), "aeiou");
});

test("distanceBetween spans the full dictionary", () => {
  // Every valid word lies strictly between the sentinels, so the span is size + 1.
  assert.equal(distanceBetween(SENTINEL_LOW, SENTINEL_HIGH), VALID_SORTED.length + 1);
});

test("distanceBetween of adjacent dictionary words is 1", () => {
  const a = VALID_SORTED[100];
  const b = VALID_SORTED[101];
  assert.equal(distanceBetween(a, b), 1);
});

test("distanceBetween is 0 when a >= b", () => {
  assert.equal(distanceBetween("zzzzz", "aaaaa"), 0);
  assert.equal(distanceBetween("abaco", "abaco"), 0);
});

test("distanceBetween grows monotonically as the upper bound moves right", () => {
  const lo = VALID_SORTED[0];
  const d1 = distanceBetween(lo, VALID_SORTED[10]);
  const d2 = distanceBetween(lo, VALID_SORTED[20]);
  assert.ok(d2 > d1);
});

test("pluralWords formats Portuguese plurals", () => {
  assert.equal(pluralWords(1), "1 palavra");
  assert.equal(pluralWords(2), "2 palavras");
  assert.equal(pluralWords(1000), "1.000 palavras");
});

test("prefixFitsGaps: full range accepts every first letter", () => {
  const full = [[SENTINEL_LOW, SENTINEL_HIGH]];
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(97 + i);
    assert.ok(prefixFitsGaps("", c, full), `letter ${c} should fit the full range`);
  }
});

test("prefixFitsGaps: a narrow gap rejects letters that fall outside it", () => {
  // Words must lie strictly between "mar" prefixes and "mas" prefixes.
  const gaps = [["maraa", "masaa"]];
  assert.ok(prefixFitsGaps("ma", "r", gaps), "'mar...' overlaps the gap");
  assert.ok(!prefixFitsGaps("ma", "a", gaps), "'maa...' is below the gap");
  assert.ok(!prefixFitsGaps("ma", "z", gaps), "'maz...' is above the gap");
});

test("prefixFitsGaps: matches any of several gaps", () => {
  const gaps = [
    ["aaaaa", "abbbb"],
    ["taaaa", "tbbbb"],
  ];
  assert.ok(prefixFitsGaps("", "a", gaps), "'a...' fits the first gap");
  assert.ok(prefixFitsGaps("", "t", gaps), "'t...' fits the second gap");
  assert.ok(!prefixFitsGaps("", "m", gaps), "'m...' fits neither gap");
});

test("prefixFitsGaps: a full 5-letter prefix can add no letter", () => {
  assert.equal(prefixFitsGaps("abcde", "f", [[SENTINEL_LOW, SENTINEL_HIGH]]), false);
});
