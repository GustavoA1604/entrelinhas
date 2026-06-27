// Generates assets/og-image.png: the social-share card shown when the game's
// link is pasted into WhatsApp, Twitter, etc. The card is a crossword-style
// board that spells ENTRE / LINHA(S) with empty "?" squares "between the
// lines", reusing the game's own tile palette so the preview looks like the
// real thing. Re-run after tweaking the design: `node scripts/gen-og.js`.
//
// Output is a 1200x630 PNG (the standard og:image aspect ratio).
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "assets", "og-image.png");
const WIDTH = 1200;
const HEIGHT = 630;

// The board, row by row. Each cell is [col, kind, letter?]:
//   - "solid": a revealed letter (green, like a solved crossword word)
//   - "empty": an unknown square (faint "?", the part you guess)
//   - "extra": the tacked-on final S, tilted to hint it's the 6th letter
// ENTRE sits above LINHA, both aligned in cols 2-6; a vertical line of empty
// squares runs down col 2, crossed by the 5-square guess row (cols 1-5).
const ROWS = [
  [
    [2, "solid", "E"],
    [3, "solid", "N"],
    [4, "solid", "T"],
    [5, "solid", "R"],
    [6, "solid", "E"],
  ],
  [[2, "empty"]],
  [
    [1, "empty"],
    [2, "empty"],
    [3, "empty"],
    [4, "empty"],
    [5, "empty"],
  ],
  [[2, "empty"]],
  [
    [2, "solid", "L"],
    [3, "solid", "I"],
    [4, "solid", "N"],
    [5, "solid", "H"],
    [6, "solid", "A"],
    [7, "extra", "S"],
  ],
];

const cells = ROWS.flatMap((cells, r) =>
  cells.map(([col, kind, letter]) => {
    const cls = kind === "solid" ? "cell solid" : kind === "extra" ? "cell extra" : "cell empty";
    const text = kind === "empty" ? "?" : (letter ?? "");
    return `<div class="${cls}" style="grid-row:${r + 1};grid-column:${col}">${text}</div>`;
  }),
).join("");

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
:root {
  --bg: #1f2330; --bg-2: #272b3a; --fg: #eef0f6; --muted: #9aa1b4;
  --accent: #7aa2ff; --ok: #5ad19a; --border: #353a4d;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --tile: 78px; --gap: 12px;
}
* { margin: 0; box-sizing: border-box; }
body {
  width: ${WIDTH}px; height: ${HEIGHT}px;
  background: radial-gradient(120% 120% at 50% 0%, #272b3a 0%, var(--bg) 60%);
  color: var(--fg); font-family: var(--mono);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 40px;
}
.board {
  display: grid;
  grid-template-columns: repeat(7, var(--tile));
  grid-auto-rows: var(--tile);
  gap: var(--gap);
}
.cell {
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--border); border-radius: 10px;
  background: var(--bg); font-weight: 600; font-size: 40px;
  text-transform: uppercase; color: var(--fg);
}
.cell.empty { color: color-mix(in srgb, var(--fg) 38%, var(--bg)); }
.cell.solid {
  background: color-mix(in srgb, var(--ok) 28%, var(--bg-2));
  border-color: color-mix(in srgb, var(--ok) 55%, var(--border));
}
.cell.extra {
  border-color: var(--accent);
  color: var(--accent);
  transform: rotate(8deg) translateY(-4px);
}
.tagline { font-size: 32px; color: var(--muted); letter-spacing: 0.5px; }
</style></head><body>
<div class="board">${cells}</div>
<div class="tagline">Adivinhe a palavra entre os limites</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
await browser.close();
console.log(`wrote ${OUT}`);
