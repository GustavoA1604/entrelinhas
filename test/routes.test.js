import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, buildHash, buildShareUrl, extractSeed } from "../src/routes.js";

test("parseHash: empty / unknown → null (menu)", () => {
  assert.equal(parseHash(""), null);
  assert.equal(parseHash("#"), null);
  assert.equal(parseHash("#nonsense"), null);
});

test("parseHash: bare mode → daily today (param null)", () => {
  assert.deepEqual(parseHash("#classic"), { mode: "classic", variant: "daily", param: null });
  assert.deepEqual(parseHash("crossword"), { mode: "crossword", variant: "daily", param: null });
});

test("parseHash: daily with a valid date", () => {
  assert.deepEqual(parseHash("#classic/daily/2026-05-29"), {
    mode: "classic",
    variant: "daily",
    param: "2026-05-29",
  });
});

test("parseHash: daily with a malformed date falls back to today", () => {
  assert.deepEqual(parseHash("#classic/daily/notadate"), {
    mode: "classic",
    variant: "daily",
    param: null,
  });
});

test("parseHash: random with a seed", () => {
  assert.deepEqual(parseHash("#crossword/random/a1b2c3"), {
    mode: "crossword",
    variant: "random",
    param: "a1b2c3",
  });
});

test("parseHash: random without a seed → param null", () => {
  assert.deepEqual(parseHash("#classic/random"), {
    mode: "classic",
    variant: "random",
    param: null,
  });
});

test("buildHash round-trips with parseHash", () => {
  const cases = [
    { mode: "classic", variant: "daily", param: "2026-05-29" },
    { mode: "crossword", variant: "daily", param: "2026-01-01" },
    { mode: "classic", variant: "random", param: "a1b2c3d4" },
    { mode: "crossword", variant: "random", param: "zzz" },
  ];
  for (const desc of cases) {
    assert.deepEqual(parseHash("#" + buildHash(desc)), desc);
  }
});

test("buildHash: bare mode for today / seedless random", () => {
  assert.equal(buildHash({ mode: "classic", variant: "daily", param: null }), "classic");
  assert.equal(buildHash({ mode: "crossword", variant: "random", param: null }), "crossword");
});

test("buildShareUrl composes an absolute link", () => {
  const url = buildShareUrl(
    { mode: "classic", variant: "random", param: "a1b2c3" },
    "https://example.com",
    "/entrelinhas/",
  );
  assert.equal(url, "https://example.com/entrelinhas/#classic/random/a1b2c3");
});

test("extractSeed: bare token", () => {
  assert.equal(extractSeed("  a1b2c3  "), "a1b2c3");
});

test("extractSeed: pulls the seed out of a full shared link", () => {
  assert.equal(
    extractSeed("Joguei! https://example.com/entrelinhas/#crossword/random/zzz9"),
    "zzz9",
  );
});

test("extractSeed: empty or multi-word junk → null", () => {
  assert.equal(extractSeed(""), null);
  assert.equal(extractSeed("two words"), null);
});
