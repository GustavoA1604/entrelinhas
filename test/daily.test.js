import { test } from "node:test";
import assert from "node:assert/strict";
import { todayKey, formatDate, parseDateKey, listDateKeys, seededRng } from "../src/daily.js";

test("todayKey returns a YYYY-MM-DD string", () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test("todayKey anchors to Brasília time (UTC-3)", () => {
  // 2026-01-02T01:00:00Z is still 2026-01-01 22:00 in Brasília.
  const realNow = Date.now;
  try {
    Date.now = () => Date.UTC(2026, 0, 2, 1, 0, 0);
    assert.equal(todayKey(), "2026-01-01");
  } finally {
    Date.now = realNow;
  }
});

test("formatDate renders DD/MM/YYYY", () => {
  assert.equal(formatDate("2026-05-29"), "29/05/2026");
});

test("parseDateKey returns a UTC midnight timestamp", () => {
  assert.equal(parseDateKey("2026-05-25"), Date.UTC(2026, 4, 25));
});

test("listDateKeys lists newest-first, inclusive of both ends", () => {
  assert.deepEqual(listDateKeys("2026-05-25", "2026-05-28"), [
    "2026-05-28",
    "2026-05-27",
    "2026-05-26",
    "2026-05-25",
  ]);
});

test("listDateKeys is a single day when epoch === today", () => {
  assert.deepEqual(listDateKeys("2026-05-25", "2026-05-25"), ["2026-05-25"]);
});

test("listDateKeys spans month boundaries", () => {
  assert.deepEqual(listDateKeys("2026-04-29", "2026-05-02"), [
    "2026-05-02",
    "2026-05-01",
    "2026-04-30",
    "2026-04-29",
  ]);
});

test("seededRng is deterministic for the same seed", () => {
  const a = seededRng("2026-05-29");
  const b = seededRng("2026-05-29");
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

test("seededRng differs across seeds and stays in [0, 1)", () => {
  const a = seededRng("crossword:2026-05-29");
  const b = seededRng("2026-05-29");
  let anyDifferent = false;
  for (let i = 0; i < 50; i++) {
    const x = a();
    const y = b();
    assert.ok(x >= 0 && x < 1);
    assert.ok(y >= 0 && y < 1);
    if (x !== y) anyDifferent = true;
  }
  assert.ok(anyDifferent, "different seeds should diverge");
});
