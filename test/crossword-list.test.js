import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCrosswordList, pruneRows, totalUnsolvedDistance } from "../src/crossword-list.js";

// Helper: the words rendered as delimiter ("guess") rows, in order.
const delimiterRows = (rows) => rows.filter((r) => r.kind === "guess");
const groupCounts = (rows) => rows.filter((r) => r.kind === "group").map((r) => r.count);

test("with no guesses, all unsolved secrets sit in one group", () => {
  const { rows, liveGaps, unsolvedCount } = computeCrosswordList({
    secretsSorted: ["bbbbb", "ddddd", "fffff"],
    solvedSet: new Set(),
    guessWords: [],
  });
  assert.deepEqual(groupCounts(rows), [3]);
  assert.equal(delimiterRows(rows).length, 0);
  assert.equal(liveGaps.length, 1);
  assert.equal(unsolvedCount, 3);
});

test("a non-secret guess splits the secrets into above/below groups", () => {
  const { rows } = computeCrosswordList({
    secretsSorted: ["bbbbb", "ddddd", "fffff"],
    solvedSet: new Set(),
    guessWords: ["ccccc"], // between bbbbb and ddddd
  });
  assert.deepEqual(groupCounts(rows), [1, 2]);
  const delims = delimiterRows(rows);
  assert.equal(delims.length, 1);
  assert.equal(delims[0].word, "ccccc");
  assert.equal(delims[0].solved, false);
});

test("a SOLVED secret becomes a delimiter for the remaining secrets", () => {
  // The core fix: solving the middle secret of a 3-word interval should split
  // the remaining two into one above and one below the solved word.
  const { rows, liveGaps } = computeCrosswordList({
    secretsSorted: ["bbbbb", "ddddd", "fffff"],
    solvedSet: new Set(["ddddd"]),
    guessWords: ["ddddd"], // solved secrets are guesses too
  });

  assert.deepEqual(groupCounts(rows), [1, 1]);

  const delims = delimiterRows(rows);
  assert.equal(delims.length, 1);
  assert.equal(delims[0].word, "ddddd");
  assert.equal(delims[0].solved, true);
  assert.ok(delims[0].upDist != null, "should show distance to the secret above");
  assert.ok(delims[0].downDist != null, "should show distance to the secret below");

  // The live interval is now split in two, narrowing future guesses.
  assert.equal(liveGaps.length, 2);
});

test("solved and non-secret delimiters interleave in alphabetic order", () => {
  const { rows } = computeCrosswordList({
    secretsSorted: ["bbbbb", "ddddd", "fffff", "hhhhh"],
    solvedSet: new Set(["ddddd"]),
    guessWords: ["ddddd", "ggggg"], // one solved secret, one plain guess
  });
  const delims = delimiterRows(rows);
  assert.deepEqual(
    delims.map((d) => [d.word, d.solved]),
    [
      ["ddddd", true],
      ["ggggg", false],
    ],
  );
  // bbbbb above ddddd; fffff between ddddd and ggggg; hhhhh below ggggg.
  assert.deepEqual(groupCounts(rows), [1, 1, 1]);
});

test("solving a middle secret reduces the total remaining distance", () => {
  const args = {
    secretsSorted: ["bbbbb", "ddddd", "fffff"],
    solvedSet: new Set(),
    guessWords: [],
  };
  const before = totalUnsolvedDistance(args);
  const after = totalUnsolvedDistance({
    ...args,
    solvedSet: new Set(["ddddd"]),
    guessWords: ["ddddd"],
  });
  assert.ok(after < before, `expected ${after} < ${before}`);
});

test("pruneRows drops delimiter rows with no adjacent unsolved secrets", () => {
  const rows = [
    { kind: "sentinel-low" },
    { kind: "guess", word: "ccccc", upDist: undefined, downDist: undefined, solved: true },
    { kind: "sentinel-high" },
  ];
  const out = pruneRows(rows);
  assert.equal(
    out.find((r) => r.kind === "guess"),
    undefined,
  );
});

test("a completed puzzle renders an empty list (no stray sentinels)", () => {
  const secrets = ["bbbbb", "ddddd", "fffff"];
  const { rows } = computeCrosswordList({
    secretsSorted: secrets,
    solvedSet: new Set(secrets),
    guessWords: secrets,
  });
  // Before pruning the raw rows still contain the bookend sentinels...
  assert.ok(rows.some((r) => r.kind === "sentinel-high"));
  // ...but nothing informative survives pruning.
  assert.deepEqual(pruneRows(rows), []);
});

test("pruneRows keeps an informative solved delimiter", () => {
  const { rows } = computeCrosswordList({
    secretsSorted: ["bbbbb", "ddddd", "fffff"],
    solvedSet: new Set(["ddddd"]),
    guessWords: ["ddddd"],
  });
  const pruned = pruneRows(rows);
  const solved = pruned.find((r) => r.kind === "guess" && r.solved);
  assert.ok(solved, "informative solved delimiter should survive pruning");
});
