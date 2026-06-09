// Generate src/data/valid.js and src/data/answers.js from the wordlists submodule.
//
// The submodule (wordlists/) emits neutral, length-agnostic lists. This script
// applies the game-specific filter (5-letter, a-z) and writes the JS modules the
// game imports. Re-run after updating the submodule or its curated overrides:
//
//   git submodule update --remote wordlists   # pull newer dictionary
//   npm run gen:data
//   npm run gen:trivia                         # trivia stats depend on the lists

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "wordlists", "pt-br", "dist");
const FIVE = /^[a-z]{5}$/;

function read(name) {
  return readFileSync(join(dist, name), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function fiveLetter(words) {
  return [...new Set(words.filter((w) => FIVE.test(w)))].sort();
}

const valid = fiveLetter(read("words.txt"));
const answers = fiveLetter(read("common.txt"));

// Preserve the invariant: every answer must be an accepted guess.
const validSet = new Set(valid);
const orphans = answers.filter((w) => !validSet.has(w));
if (orphans.length) {
  throw new Error(`answers not in valid: ${orphans.slice(0, 10).join(", ")}`);
}

const quoted = (words, indent = "  ") => words.map((w) => `${indent}"${w}",`).join("\n");

writeFileSync(
  join(root, "src", "data", "valid.js"),
  `// Auto-generated. Accepted 5-letter guesses (broad PT-BR dictionary, accents stripped).
export const VALID = new Set([
${quoted(valid)}
]);
`,
);

writeFileSync(
  join(root, "src", "data", "answers.js"),
  `// Auto-generated. Common PT-BR 5-letter words used as daily answers.
export const ANSWERS = [
${quoted(answers)}
];
`,
);

console.log(`gen:data wrote VALID=${valid.length}, ANSWERS=${answers.length}`);
