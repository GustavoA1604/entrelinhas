import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHintState } from "../src/hint.js";

const NOW = 1_000_000;

test("ready only when range is within max AND idle time elapsed", () => {
  const base = { start: 1000, rangeMax: 100, idleMs: 10_000, now: NOW };
  // range ok, idle ok
  assert.equal(computeHintState({ ...base, range: 50, lastGuessAt: NOW - 20_000 }).ready, true);
  // range ok, idle NOT elapsed
  assert.equal(computeHintState({ ...base, range: 50, lastGuessAt: NOW - 1_000 }).ready, false);
  // range too big, idle ok
  assert.equal(computeHintState({ ...base, range: 500, lastGuessAt: NOW - 20_000 }).ready, false);
});

test("rangeProgress is 1 once range is within max", () => {
  const s = computeHintState({
    range: 80,
    start: 1000,
    rangeMax: 100,
    idleMs: 10_000,
    lastGuessAt: NOW,
    now: NOW,
  });
  assert.equal(s.rangeOk, true);
  assert.equal(s.rangeProgress, 1);
});

test("rangeProgress is between 0 and 1 while still outside max", () => {
  const s = computeHintState({
    range: 1000,
    start: 5000,
    rangeMax: 100,
    idleMs: 10_000,
    lastGuessAt: NOW,
    now: NOW,
  });
  assert.equal(s.rangeOk, false);
  assert.ok(s.rangeProgress > 0 && s.rangeProgress < 1);
});

test("rangeProgress increases on a log scale as range shrinks toward max", () => {
  const mk = (range) =>
    computeHintState({
      range,
      start: 5000,
      rangeMax: 100,
      idleMs: 10_000,
      lastGuessAt: NOW,
      now: NOW,
    }).rangeProgress;
  assert.ok(mk(500) > mk(2000));
  assert.ok(mk(2000) > mk(4000));
});

test("idleProgress and remainSec track elapsed idle time", () => {
  const s = computeHintState({
    range: 50,
    start: 100,
    rangeMax: 100,
    idleMs: 10_000,
    lastGuessAt: NOW - 4_000,
    now: NOW,
  });
  assert.ok(Math.abs(s.idleProgress - 0.4) < 1e-9);
  assert.equal(s.remainSec, 6);
});

test("idleProgress clamps to 1 and remainSec floors at 0", () => {
  const s = computeHintState({
    range: 50,
    start: 100,
    rangeMax: 100,
    idleMs: 10_000,
    lastGuessAt: NOW - 999_999,
    now: NOW,
  });
  assert.equal(s.idleProgress, 1);
  assert.equal(s.remainSec, 0);
});

test("handles start <= rangeMax without dividing by log(1)", () => {
  const s = computeHintState({
    range: 90,
    start: 90,
    rangeMax: 100,
    idleMs: 10_000,
    lastGuessAt: NOW,
    now: NOW,
  });
  assert.equal(s.rangeProgress, 1);
});
