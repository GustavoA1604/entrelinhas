import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModeStats, computeTopWords } from "../src/stats.js";

// Helpers to build daily entries newest-first, the order listDateKeys returns.
const win = (n) => ({
  saved: {
    done: true,
    won: true,
    guesses: Array.from({ length: n }, (_, i) => ({ word: `w${i}` })),
  },
});
const loss = () => ({ saved: { done: true, won: false, guesses: [{ word: "x" }] } });
const inProgress = () => ({ saved: { done: false, won: false, guesses: [{ word: "y" }] } });
const unplayed = () => ({ saved: null });

test("counts played and won, win rate over finished games only", () => {
  const s = computeModeStats([win(4), loss(), inProgress(), unplayed()]);
  assert.equal(s.played, 2);
  assert.equal(s.won, 1);
  assert.equal(s.winRate, 50);
});

test("win rate is 0 with no finished games (no divide-by-zero)", () => {
  const s = computeModeStats([inProgress(), unplayed()]);
  assert.equal(s.played, 0);
  assert.equal(s.winRate, 0);
});

test("random aggregate is merged into played/won/distribution", () => {
  const randomAgg = { played: 3, won: 2, dist: { 4: 1, 7: 1 }, words: {} };
  const s = computeModeStats([win(4), loss()], randomAgg);
  assert.equal(s.played, 2 + 3);
  assert.equal(s.won, 1 + 2);
  // daily win at 4 + random wins at 4 and 7 => 4:2, 7:1
  assert.deepEqual(s.distribution, [
    { guesses: 4, count: 2 },
    { guesses: 7, count: 1 },
  ]);
});

test("current streak counts consecutive recent wins; today unfinished doesn't break it", () => {
  const s = computeModeStats([inProgress(), win(3), win(5), win(2), loss(), win(9)]);
  assert.equal(s.currentStreak, 3);
});

test("a loss today breaks the current streak", () => {
  assert.equal(computeModeStats([loss(), win(3), win(4)]).currentStreak, 0);
});

test("an unplayed day in the middle breaks both streaks", () => {
  const s = computeModeStats([win(2), win(3), unplayed(), win(4), win(5), win(6)]);
  assert.equal(s.currentStreak, 2);
  assert.equal(s.maxStreak, 3);
});

test("distribution lists only occurred guess-counts, ascending", () => {
  const s = computeModeStats([win(6), win(4), win(6), win(8)]);
  assert.deepEqual(s.distribution, [
    { guesses: 4, count: 1 },
    { guesses: 6, count: 2 },
    { guesses: 8, count: 1 },
  ]);
});

test("top words pool across modes and random aggregates, ranked then capped", () => {
  const classicDaily = [
    { saved: { guesses: [{ word: "lagos" }, { word: "mundo" }] } },
    { saved: { guesses: [{ word: "lagos" }] } },
  ];
  const crosswordDaily = [{ saved: { guesses: [{ word: "praia" }] } }];
  const sources = [
    { dailyEntries: classicDaily, randomAgg: { words: { lagos: 2, casas: 1 } } },
    { dailyEntries: crosswordDaily, randomAgg: { words: { mundo: 3 } } },
  ];
  // lagos: 2(daily)+2(random)=4, mundo: 1+3=4, praia:1, casas:1
  const top = computeTopWords(sources, { limit: 3 });
  assert.deepEqual(top, [
    { word: "lagos", count: 4 },
    { word: "mundo", count: 4 },
    { word: "casas", count: 1 }, // tie at 1 broken alphabetically (casas < praia)
  ]);
});
