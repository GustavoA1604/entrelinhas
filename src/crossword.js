import { ANSWERS } from "./data/answers.js";
import { VALID } from "./data/valid.js";
import { showToast } from "./toast.js";
import { isMobileDevice, copyToClipboard } from "./share-helpers.js";

// === Tunables ===
const NUM_SECRETS = 5;
const MAX_GUESSES = 50;
const STORAGE_PREFIX = "entrelinhas:crossword-daily:";
export const CROSSWORD_STORAGE_PREFIX = STORAGE_PREFIX;

try {
  const legacy = JSON.parse(localStorage.getItem("entrelinhas:crossword-daily") || "null");
  if (legacy && typeof legacy === "object" && legacy.dateKey) {
    if (!localStorage.getItem(STORAGE_PREFIX + legacy.dateKey)) {
      localStorage.setItem(STORAGE_PREFIX + legacy.dateKey, JSON.stringify(legacy));
    }
    localStorage.removeItem("entrelinhas:crossword-daily");
  }
} catch {}
const SENTINEL_LOW = "aaaaa";
const SENTINEL_HIGH = "zzzzz";
const GEN_MAX_ATTEMPTS = 300;
const HINT_TIPS = [
  { rangeMax: 500, idleMs: 10_000 },
  { rangeMax: 100, idleMs: 20_000 },
  { rangeMax: 30,  idleMs: 30_000 },
];

const VALID_SORTED = [...VALID].sort();
const ANSWER_POOL = ANSWERS.filter((w) => w.length === 5);

// === Helpers ===
const $ = (id) => document.getElementById(id);
function stripAccents(s) { return s.normalize("NFD").replace(/\p{M}/gu, ""); }
function normalize(s) { return stripAccents(s).toLowerCase().trim(); }
function lowerBoundIdx(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
function upperBoundIdx(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; }
  return lo;
}
function distanceBetween(a, b) {
  if (!(a < b)) return 0;
  const i = upperBoundIdx(VALID_SORTED, a);
  const j = lowerBoundIdx(VALID_SORTED, b);
  return Math.max(0, j - i) + 1;
}
function pluralWords(n) {
  return n === 1 ? "1 palavra" : `${n.toLocaleString("pt-BR")} palavras`;
}
function pluralSecretas(n) {
  return n === 1 ? "1 secreta" : `${n.toLocaleString("pt-BR")} secretas`;
}
function todayKey() {
  // Anchor the daily puzzle to Brasília time (UTC-3, no DST) so every device
  // generates the same date key for the same UTC instant.
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
  const d = new Date(Date.now() - BRT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function formatDate(key) {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}
function seededRng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// === Crossword generator ===
function placeWord(word, x, y, dir, placed, grid) {
  placed.push({ word, x, y, dir });
  for (let i = 0; i < word.length; i++) {
    const cx = dir === "H" ? x + i : x;
    const cy = dir === "H" ? y : y + i;
    grid.set(`${cx},${cy}`, word[i]);
  }
}
function isValidPlacement(word, x, y, dir, grid) {
  const beforeX = dir === "H" ? x - 1 : x;
  const beforeY = dir === "H" ? y : y - 1;
  if (grid.has(`${beforeX},${beforeY}`)) return false;
  const afterX = dir === "H" ? x + word.length : x;
  const afterY = dir === "H" ? y : y + word.length;
  if (grid.has(`${afterX},${afterY}`)) return false;

  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const cx = dir === "H" ? x + i : x;
    const cy = dir === "H" ? y : y + i;
    const existing = grid.get(`${cx},${cy}`);
    if (existing) {
      if (existing !== word[i]) return false;
      crossings++;
    } else {
      const p1x = dir === "H" ? cx : cx - 1;
      const p1y = dir === "H" ? cy - 1 : cy;
      const p2x = dir === "H" ? cx : cx + 1;
      const p2y = dir === "H" ? cy + 1 : cy;
      if (grid.has(`${p1x},${p1y}`)) return false;
      if (grid.has(`${p2x},${p2y}`)) return false;
    }
  }
  return crossings >= 1;
}
function countCrossings(word, x, y, dir, grid) {
  let c = 0;
  for (let i = 0; i < word.length; i++) {
    const cx = dir === "H" ? x + i : x;
    const cy = dir === "H" ? y : y + i;
    if (grid.has(`${cx},${cy}`)) c++;
  }
  return c;
}
function findPlacements(word, placed, grid) {
  const seen = new Set();
  const results = [];
  for (const p of placed) {
    const newDir = p.dir === "H" ? "V" : "H";
    for (let pi = 0; pi < p.word.length; pi++) {
      const px = p.dir === "H" ? p.x + pi : p.x;
      const py = p.dir === "H" ? p.y : p.y + pi;
      const letter = p.word[pi];
      for (let wi = 0; wi < word.length; wi++) {
        if (word[wi] !== letter) continue;
        const nx = newDir === "H" ? px - wi : px;
        const ny = newDir === "H" ? py : py - wi;
        const key = `${nx},${ny},${newDir}`;
        if (seen.has(key)) continue;
        if (isValidPlacement(word, nx, ny, newDir, grid)) {
          seen.add(key);
          const crossings = countCrossings(word, nx, ny, newDir, grid);
          results.push({ x: nx, y: ny, dir: newDir, crossings });
        }
      }
    }
  }
  return results;
}
// Weighted random pick — bias toward placements with more crossings (loops).
function pickWeighted(placements, rng) {
  let total = 0;
  for (const p of placements) total += p.crossings * p.crossings;
  let r = rng() * total;
  for (const p of placements) {
    r -= p.crossings * p.crossings;
    if (r <= 0) return p;
  }
  return placements[placements.length - 1];
}
function tryGenerate(rng, numWords) {
  const placed = [];
  const grid = new Map();
  const used = new Set();
  const first = ANSWER_POOL[Math.floor(rng() * ANSWER_POOL.length)];
  placeWord(first, 0, 0, "H", placed, grid);
  used.add(first);

  while (placed.length < numWords) {
    const order = shuffleInPlace(ANSWER_POOL.slice(), rng);
    // Collect (candidate, placement) pairs across the first CAND_WINDOW candidates
    // that have any valid placement, then weighted-pick by crossings² across all.
    const CAND_WINDOW = 30;
    const pool = [];
    let candsWithPlacements = 0;
    for (const candidate of order) {
      if (used.has(candidate)) continue;
      const placements = findPlacements(candidate, placed, grid);
      if (placements.length === 0) continue;
      for (const pl of placements) pool.push({ candidate, ...pl });
      candsWithPlacements++;
      if (candsWithPlacements >= CAND_WINDOW) break;
    }
    if (pool.length === 0) return null;
    // Hard preference: from word 4 onward, if any placement closes a loop (crossings >= 2),
    // restrict the pool to those. Otherwise fall back to all options.
    let effectivePool = pool;
    if (placed.length >= 3) {
      const looped = pool.filter((p) => p.crossings >= 2);
      if (looped.length > 0) effectivePool = looped;
    }
    const chosen = pickWeighted(effectivePool, rng);
    placeWord(chosen.candidate, chosen.x, chosen.y, chosen.dir, placed, grid);
    used.add(chosen.candidate);
  }
  return { placed };
}
function generateCrossword(seed) {
  const rng = seed ? seededRng(seed) : Math.random;
  for (let i = 0; i < GEN_MAX_ATTEMPTS; i++) {
    const r = tryGenerate(rng, NUM_SECRETS);
    if (r) return r;
  }
  // Should be rare; fall back to a tiny puzzle
  return tryGenerate(seededRng("fallback"), NUM_SECRETS);
}

// === Public init ===
export function initCrossword({ onBack } = {}) {
  const grid = $("cw-grid");
  const list = $("cw-list");
  const input = $("cw-guess-input");
  const form = $("cw-guess-form");
  const guessBtn = $("cw-guess-btn");
  const alphaHint = $("cw-alpha-hint");
  const guessesLeftEl = $("cw-guesses-left");
  const solvedCountEl = $("cw-solved-count");
  const totalCountEl = $("cw-total-count");
  const puzzleLabel = $("cw-puzzle-label");
  const puzzleDate = $("cw-puzzle-date");
  const hintBtn = $("cw-hint-btn");
  const hintsEl = $("cw-hints");
  const helpBtn = $("cw-help-btn");
  const helpDialog = $("cw-help-dialog");
  const endDialog = $("cw-end-dialog");
  const endTitle = $("cw-end-title");
  const endBody = $("cw-end-body");
  const shareBtn = $("cw-share-btn");
  const playAgainBtn = $("cw-play-again-btn");
  const endMenuBtn = $("cw-end-menu-btn");

  const state = {
    mode: "daily",
    dateKey: null,
    isHistorical: false,
    placed: [],
    secrets: [],            // lowercase, in placement order
    secretsSorted: [],      // sorted alphabetic copy
    solvedSet: new Set(),
    guesses: [],            // { word, isSecret }
    done: false,
    won: false,
    tipsRevealed: [],       // [{ pos: [ox, oy], afterGuess: N }]
    lastGuessAt: Date.now(),
    selectingTip: false,
    tipStartRange: null,
  };

  function setMessage(text, kind = "") {
    if (text) showToast(text, kind);
    else showToast("");
  }

  // --- List computation ---
  // Returns an array of rows representing the side list:
  //   { kind: 'sentinel-low' | 'sentinel-high' }
  //   { kind: 'group', count }
  //   { kind: 'guess', word, upDist, downDist }  // *Dist undefined when not shown
  // Also returns liveGaps: array of [loExcl, hiExcl] where unsolved secrets > 0.
  function computeList() {
    const unsolvedSecrets = state.secretsSorted.filter((w) => !state.solvedSet.has(w));
    const nonSecret = state.guesses
      .filter((g) => !g.isSecret)
      .map((g) => g.word)
      .sort();

    // Boundaries between which we count secrets: [AAAAA, g1, g2, ..., ZZZZZ]
    const bounds = [SENTINEL_LOW, ...nonSecret, SENTINEL_HIGH];

    // For each gap i (between bounds[i] and bounds[i+1]) count unsolved secrets strictly inside.
    const gapCounts = [];
    const gapSecrets = []; // sorted secrets per gap
    for (let i = 0; i < bounds.length - 1; i++) {
      const lo = bounds[i], hi = bounds[i + 1];
      const inGap = unsolvedSecrets.filter((s) => s > lo && s < hi);
      gapCounts.push(inGap.length);
      gapSecrets.push(inGap);
    }

    // Build display rows + liveGaps
    const rows = [];
    const liveGaps = [];

    rows.push({ kind: "sentinel-low" });
    for (let i = 0; i < bounds.length - 1; i++) {
      const count = gapCounts[i];
      if (count > 0) rows.push({ kind: "group", count });
      if (count > 0) liveGaps.push([bounds[i], bounds[i + 1]]);

      // If there's a guess at bounds[i+1] (not the final sentinel), render it
      if (i + 1 < bounds.length - 1) {
        const word = bounds[i + 1];
        // count above (between previous boundary and this guess) = gapCounts[i]
        // count below (between this guess and next boundary) = gapCounts[i+1]
        const upGroup = gapSecrets[i];
        const downGroup = gapSecrets[i + 1];
        let upDist, downDist;
        if (upGroup.length > 0) {
          // nearest secret above (largest in upGroup) is the last sorted element
          const nearestAbove = upGroup[upGroup.length - 1];
          upDist = distanceBetween(nearestAbove, word);
        }
        if (downGroup.length > 0) {
          const nearestBelow = downGroup[0];
          downDist = distanceBetween(word, nearestBelow);
        }
        rows.push({ kind: "guess", word, upDist, downDist });
      }
    }
    rows.push({ kind: "sentinel-high" });

    return { rows, liveGaps, unsolvedCount: unsolvedSecrets.length };
  }

  // --- Validity for input prefix highlighting and submission ---
  function isLetterValid(prefix, c, liveGaps) {
    const k = prefix.length;
    if (k >= 5) return false;
    const pad = 5 - k - 1;
    const lo = prefix + c + "a".repeat(pad);
    const hi = prefix + c + "z".repeat(pad);
    for (const [gLo, gHi] of liveGaps) {
      if (hi > gLo && lo < gHi) return true;
    }
    return false;
  }
  function isWordInLiveGap(word, liveGaps) {
    for (const [gLo, gHi] of liveGaps) {
      if (word > gLo && word < gHi) return true;
    }
    return false;
  }

  // --- Hint helpers ---
  function revealedSet() {
    return new Set(state.tipsRevealed.map((t) => `${t.pos[0]},${t.pos[1]}`));
  }
  function letterAt(ox, oy) {
    for (const p of state.placed) {
      for (let i = 0; i < p.word.length; i++) {
        const cx = p.dir === "H" ? p.x + i : p.x;
        const cy = p.dir === "H" ? p.y : p.y + i;
        if (cx === ox && cy === oy) return p.word[i];
      }
    }
    return null;
  }
  function totalDistance() {
    const nonSecret = state.guesses.filter((g) => !g.isSecret).map((g) => g.word).sort();
    const bounds = [SENTINEL_LOW, ...nonSecret, SENTINEL_HIGH];
    let total = 0;
    for (const secret of state.secretsSorted) {
      if (state.solvedSet.has(secret)) continue;
      let lo = SENTINEL_LOW, hi = SENTINEL_HIGH;
      for (let i = 0; i < bounds.length - 1; i++) {
        if (secret > bounds[i] && secret < bounds[i + 1]) { lo = bounds[i]; hi = bounds[i + 1]; break; }
      }
      total += distanceBetween(lo, secret) + distanceBetween(secret, hi);
    }
    return total;
  }

  // --- Rendering ---
  function renderGrid() {
    grid.innerHTML = "";
    if (state.placed.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of state.placed) {
      for (let i = 0; i < p.word.length; i++) {
        const cx = p.dir === "H" ? p.x + i : p.x;
        const cy = p.dir === "H" ? p.y : p.y + i;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
      }
    }
    const W = maxX - minX + 1;
    const H = maxY - minY + 1;
    const revealed = revealedSet();

    // cells[y][x] = { letter, solved, ox, oy }
    const cells = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
    for (const p of state.placed) {
      const isSolved = state.solvedSet.has(p.word);
      for (let i = 0; i < p.word.length; i++) {
        const ocx = p.dir === "H" ? p.x + i : p.x;
        const ocy = p.dir === "H" ? p.y : p.y + i;
        const cx = ocx - minX;
        const cy = ocy - minY;
        const cur = cells[cy][cx] || { letter: p.word[i], solved: false, ox: ocx, oy: ocy };
        cur.letter = p.word[i];
        cur.solved = cur.solved || isSolved;
        cur.ox = ocx; cur.oy = ocy;
        cells[cy][cx] = cur;
      }
    }

    grid.style.gridTemplateColumns = `repeat(${W}, var(--cw-cell))`;
    grid.style.gridTemplateRows = `repeat(${H}, var(--cw-cell))`;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = cells[y][x];
        const div = document.createElement("div");
        if (!c) {
          div.className = "cw-cell cw-empty";
        } else {
          const isRevealed = !c.solved && revealed.has(`${c.ox},${c.oy}`);
          const cls = ["cw-cell"];
          if (c.solved) cls.push("cw-solved");
          else if (isRevealed) cls.push("cw-revealed");
          div.className = cls.join(" ");
          div.dataset.ox = String(c.ox);
          div.dataset.oy = String(c.oy);
          div.textContent = (c.solved || isRevealed) ? c.letter.toUpperCase() : "";
        }
        grid.appendChild(div);
      }
    }
  }

  function pruneRows(rows) {
    // 1. Drop guess rows that contribute no info (no unsolved secrets on either side).
    let out = rows.filter((r) => !(r.kind === "guess" && r.upDist == null && r.downDist == null));
    // 2. Drop sentinel-low if not followed by a group (no secrets above the first remaining guess).
    if (out.length >= 2 && out[0].kind === "sentinel-low" && out[1].kind !== "group") {
      out = out.slice(1);
    }
    // 3. Drop sentinel-high if not preceded by a group.
    if (out.length >= 2 && out[out.length - 1].kind === "sentinel-high" && out[out.length - 2].kind !== "group") {
      out = out.slice(0, -1);
    }
    return out;
  }

  function renderList() {
    const { rows } = computeList();
    const visible = pruneRows(rows);
    list.innerHTML = "";
    for (const r of visible) {
      const el = document.createElement("div");
      if (r.kind === "sentinel-low") {
        el.className = "cw-row cw-sentinel";
        el.innerHTML = `<span class="word">${SENTINEL_LOW}</span><span class="tag">?? palavras</span>`;
      } else if (r.kind === "sentinel-high") {
        el.className = "cw-row cw-sentinel";
        el.innerHTML = `<span class="word">${SENTINEL_HIGH}</span><span class="tag">?? palavras</span>`;
      } else if (r.kind === "group") {
        el.className = "cw-row cw-group";
        el.innerHTML = `<span class="word">?????</span><span class="tag">${pluralSecretas(r.count)}</span>`;
      } else if (r.kind === "guess") {
        el.className = "cw-row cw-guess";
        const tags = [];
        if (r.upDist != null) tags.push(`<span class="tag tag-up">↑ ${pluralWords(r.upDist)}</span>`);
        if (r.downDist != null) tags.push(`<span class="tag tag-down">↓ ${pluralWords(r.downDist)}</span>`);
        el.innerHTML = `<span class="word">${r.word}</span><span class="tags">${tags.join("")}</span>`;
      }
      list.appendChild(el);
    }
  }

  function renderAlphabet() {
    const prefix = normalize(input.value);
    const { liveGaps } = computeList();
    alphaHint.innerHTML = "";
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(97 + i);
      const span = document.createElement("span");
      span.className = "letter " + (isLetterValid(prefix, c, liveGaps) ? "enabled" : "disabled");
      span.textContent = c;
      alphaHint.appendChild(span);
    }
  }

  function renderAll() {
    renderGrid();
    renderList();
    renderAlphabet();
    renderHints();
    guessesLeftEl.textContent = MAX_GUESSES - state.guesses.length;
    solvedCountEl.textContent = state.solvedSet.size;
    totalCountEl.textContent = state.secrets.length;
  }

  function renderHints() {
    // In crossword mode the revealed letter shows up directly in the grid,
    // so no persistent banner is needed.
    hintsEl.innerHTML = "";
  }

  function isHintReady() {
    const next = HINT_TIPS[state.tipsRevealed.length];
    if (!next) return false;
    return totalDistance() <= next.rangeMax && (Date.now() - state.lastGuessAt) >= next.idleMs;
  }
  function updateHintButton() {
    hintBtn.style.setProperty("--tip-progress", "0");
    hintBtn.style.setProperty("--tip-ring-color", "var(--muted)");
    if (state.done) { hintBtn.setAttribute("aria-disabled", "true"); hintBtn.classList.remove("ready"); hintBtn.title = "Dica"; return; }
    if (state.selectingTip) {
      hintBtn.setAttribute("aria-disabled", "false"); hintBtn.classList.remove("ready");
      hintBtn.title = "Toque em uma letra para revelar (Esc para cancelar)";
      return;
    }
    const next = HINT_TIPS[state.tipsRevealed.length];
    if (!next) { hintBtn.setAttribute("aria-disabled", "true"); hintBtn.classList.remove("ready"); hintBtn.title = "Sem mais dicas"; return; }
    const range = totalDistance();
    const start = state.tipStartRange ?? range;
    const rangeOk = range <= next.rangeMax;
    // Log-scale progress: linear plateaus at 95%+ when start >> rangeMax
    // (e.g., 20000 → 500). Log keeps the fill smooth across orders of magnitude.
    let rangeProgress;
    if (rangeOk || start <= next.rangeMax) {
      rangeProgress = 1;
    } else {
      const denom = Math.log(start / next.rangeMax);
      rangeProgress = denom > 0
        ? Math.max(0, Math.min(1, Math.log(start / range) / denom))
        : 1;
    }
    const idle = Date.now() - state.lastGuessAt;
    const idleProgress = Math.max(0, Math.min(1, idle / next.idleMs));
    const ready = rangeOk && idleProgress >= 1;
    hintBtn.setAttribute("aria-disabled", String(!ready));
    hintBtn.classList.toggle("ready", ready);
    if (!ready) {
      if (!rangeOk) {
        hintBtn.style.setProperty("--tip-progress", String(rangeProgress));
        hintBtn.style.setProperty("--tip-ring-color", "color-mix(in srgb, var(--warn) 60%, #000)");
      } else {
        hintBtn.style.setProperty("--tip-progress", String(idleProgress));
        hintBtn.style.setProperty("--tip-ring-color", "var(--warn)");
      }
    }
    const remainSec = Math.max(0, Math.ceil((next.idleMs - idle) / 1000));
    const reasons = [];
    if (!rangeOk) reasons.push(`distância ${range} (precisa ≤${next.rangeMax})`);
    if (idleProgress < 1) reasons.push(`aguarde ${remainSec}s`);
    hintBtn.title = ready ? "Dica disponível" : `Próxima dica: ${reasons.join(" · ")}`;
  }
  function startSelecting() {
    state.selectingTip = true;
    grid.classList.add("cw-selecting");
    setMessage("Toque em uma letra do tabuleiro para revelar (Esc para cancelar).", "");
    updateHintButton();
  }
  function stopSelecting() {
    const wasSelecting = state.selectingTip;
    state.selectingTip = false;
    grid.classList.remove("cw-selecting");
    if (wasSelecting) setMessage("");
    updateHintButton();
  }
  function revealCellAt(ox, oy) {
    state.tipsRevealed.push({ pos: [ox, oy], afterGuess: state.guesses.length });
    state.tipStartRange = totalDistance();
    stopSelecting();
    saveDaily();
    renderAll();
    updateHintButton();
  }

  // --- Game flow ---
  function submitGuess(raw) {
    if (state.done) return;
    const word = normalize(raw);
    const fail = (text) => { setMessage(text, "error"); input.focus({ preventScroll: true }); };
    if (!/^[a-z]{5}$/.test(word)) { fail("Use 5 letras (a–z)."); return; }
    if (!VALID.has(word) && !state.secrets.includes(word)) {
      fail(`"${word}" não está no dicionário.`); return;
    }
    if (state.guesses.some((g) => g.word === word)) {
      fail("Você já tentou essa palavra."); return;
    }
    const isSecret = state.secrets.includes(word) && !state.solvedSet.has(word);

    if (!isSecret) {
      const { liveGaps } = computeList();
      if (!isWordInLiveGap(word, liveGaps)) {
        fail(`"${word}" está fora dos limites atuais.`);
        return;
      }
    }

    state.guesses.push({ word, isSecret });
    state.lastGuessAt = Date.now();
    if (isSecret) state.solvedSet.add(word);

    if (state.solvedSet.size === state.secrets.length) {
      state.done = true; state.won = true;
    } else if (state.guesses.length >= MAX_GUESSES) {
      state.done = true; state.won = false;
    }

    input.value = "";
    setMessage(isSecret ? "Acertou uma! 🎉" : "", isSecret ? "success" : "");
    saveDaily();
    renderAll();
    updateHintButton();

    if (state.done) {
      input.disabled = true;
      setTimeout(showEndDialog, 350);
    } else {
      input.focus({ preventScroll: true });
    }
  }

  function loadDaily(dateKey) {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + dateKey) || "null"); } catch { return null; }
  }
  function saveDaily() {
    if (state.mode !== "daily") return;
    const payload = {
      dateKey: state.dateKey,
      secrets: state.secrets,
      placed: state.placed,
      guesses: state.guesses,
      solved: [...state.solvedSet],
      done: state.done,
      won: state.won,
      tipsRevealed: state.tipsRevealed,
      tipStartRange: state.tipStartRange,
    };
    try { localStorage.setItem(STORAGE_PREFIX + state.dateKey, JSON.stringify(payload)); } catch {}
  }

  function startGame(mode, customDateKey) {
    if (endDialog.open) endDialog.close();
    state.mode = mode;
    state.guesses = [];
    state.solvedSet = new Set();
    state.done = false;
    state.won = false;
    state.tipsRevealed = [];
    state.lastGuessAt = Date.now();
    state.tipStartRange = null;
    stopSelecting();

    let restored = false;
    if (mode === "daily") {
      const today = todayKey();
      state.dateKey = customDateKey || today;
      state.isHistorical = state.dateKey !== today;
      const saved = loadDaily(state.dateKey);
      if (saved && saved.dateKey === state.dateKey && Array.isArray(saved.secrets) && saved.secrets.length === NUM_SECRETS) {
        state.placed = saved.placed;
        state.secrets = saved.secrets;
        state.secretsSorted = [...state.secrets].sort();
        state.guesses = saved.guesses || [];
        state.solvedSet = new Set(saved.solved || []);
        state.done = !!saved.done;
        state.won = !!saved.won;
        state.tipsRevealed = Array.isArray(saved.tipsRevealed) ? saved.tipsRevealed : [];
        if (typeof saved.tipStartRange === "number") state.tipStartRange = saved.tipStartRange;
        restored = true;
      }
      puzzleLabel.textContent = "Cruzadas do dia";
      puzzleDate.textContent = formatDate(state.dateKey);
    } else {
      state.dateKey = null;
      state.isHistorical = false;
      puzzleLabel.textContent = "Modo aleatório";
      puzzleDate.textContent = "";
    }

    if (!restored) {
      const seed = mode === "daily" ? `crossword:${state.dateKey}` : null;
      const puzzle = generateCrossword(seed);
      state.placed = puzzle.placed;
      state.secrets = puzzle.placed.map((p) => p.word);
      state.secretsSorted = [...state.secrets].sort();
    }
    if (state.tipStartRange == null) state.tipStartRange = totalDistance();

    setMessage("");
    input.value = "";
    input.disabled = state.done;
    renderAll();
    updateHintButton();
    if (state.done) showEndDialog();
  }

  function showEndDialog() {
    endTitle.textContent = state.won ? "Você completou! 🎉" : "Fim de jogo";
    endBody.innerHTML = "";
    const info = document.createElement("p");
    const remaining = state.secretsSorted.filter((s) => !state.solvedSet.has(s));
    info.textContent = state.won
      ? `${state.guesses.length} tentativa${state.guesses.length === 1 ? "" : "s"} usadas. Palavras: ${state.secretsSorted.join(", ")}.`
      : `Faltaram: ${remaining.join(", ") || "—"}. Palavras: ${state.secretsSorted.join(", ")}.`;
    info.style.margin = "0 0 10px";
    endBody.appendChild(info);
    if (state.tipsRevealed.length > 0) {
      const tipsP = document.createElement("p");
      tipsP.style.margin = "0 0 10px";
      tipsP.textContent = `💡 ${state.tipsRevealed.length} dica${state.tipsRevealed.length === 1 ? "" : "s"} usada${state.tipsRevealed.length === 1 ? "" : "s"}.`;
      endBody.appendChild(tipsP);
    }
    if (typeof endDialog.showModal === "function") endDialog.showModal();
  }

  function buildEventLines() {
    const lines = [];
    const emitTipsAfter = (k) => {
      for (const t of state.tipsRevealed) {
        if (t.afterGuess === k) lines.push("💡 Dica usada");
      }
    };
    emitTipsAfter(0);
    let solvedRank = 0;
    for (let i = 0; i < state.guesses.length; i++) {
      const g = state.guesses[i];
      if (g.isSecret) {
        solvedRank++;
        const n = i + 1;
        lines.push(`🟩 ${solvedRank}ª palavra em ${n} tentativa${n === 1 ? "" : "s"}`);
      }
      emitTipsAfter(i + 1);
    }
    const missing = state.secrets.length - state.solvedSet.size;
    if (missing > 0) {
      lines.push(`❌ Faltaram ${missing} palavra${missing === 1 ? "" : "s"}`);
    }
    return lines;
  }

  function buildShareText() {
    const header = state.mode === "daily" ? `Entrelinhas Cruzadas ${formatDate(state.dateKey)}` : "Entrelinhas Cruzadas (aleatório)";
    const score = `${state.solvedSet.size}/${state.secrets.length} em ${state.guesses.length}/${MAX_GUESSES}`;
    const events = buildEventLines().join("\n");
    const footer = "Jogue também em https://gustavoa1604.github.io/entrelinhas/"
    return `${header}\n${score}\n\n${events}\n\n${footer}`;
  }
  async function share() {
    const text = buildShareText();
    console.log("Shared text")
    if (isMobileDevice() && navigator.share) {
      console.log("Trying to share")
      try { await navigator.share({ text }); return; }
      catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    if (await copyToClipboard(text)) {
      setMessage("Resultado copiado!", "success");
    } else {
      setMessage("Não foi possível copiar o resultado.", "error");
    }
  }

  // --- Wiring ---
  form.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(input.value); });
  guessBtn.addEventListener("click", (e) => { e.preventDefault(); if (!input.disabled) form.requestSubmit(); });
  input.addEventListener("input", () => {
    const cleaned = normalize(input.value).slice(0, 5);
    if (cleaned !== input.value) input.value = cleaned;
    renderAlphabet();
  });
  hintBtn.addEventListener("click", () => {
    if (state.done) return;
    if (state.selectingTip) { stopSelecting(); return; }
    if (!isHintReady()) {
      const next = HINT_TIPS[state.tipsRevealed.length];
      if (!next) { showToast("Sem mais dicas disponíveis", "warn"); return; }
      const range = totalDistance();
      const idle = Date.now() - state.lastGuessAt;
      if (range > next.rangeMax) {
        const need = range - next.rangeMax;
        showToast("Chegue mais próximo da resposta para liberar a próxima dica", "warn");
      } else {
        const remainSec = Math.max(1, Math.ceil((next.idleMs - idle) / 1000));
        showToast(`Aguarde ${remainSec}s para liberar a dica`, "warn");
      }
      return;
    }
    startSelecting();
  });
  grid.addEventListener("click", (e) => {
    if (!state.selectingTip) return;
    const cell = e.target.closest(".cw-cell");
    if (!cell || cell.classList.contains("cw-empty")) return;
    if (cell.classList.contains("cw-solved") || cell.classList.contains("cw-revealed")) return;
    const ox = Number(cell.dataset.ox), oy = Number(cell.dataset.oy);
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) return;
    revealCellAt(ox, oy);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.selectingTip) stopSelecting();
  });
  setInterval(updateHintButton, 500);
  helpBtn.addEventListener("click", () => { if (typeof helpDialog.showModal === "function") helpDialog.showModal(); });
  shareBtn.addEventListener("click", share);
  playAgainBtn.addEventListener("click", () => { endDialog.close(); startGame("random"); });
  endMenuBtn.addEventListener("click", () => { endDialog.close(); onBack && onBack(); });

  return {
    start(mode, dateKey) { startGame(mode, dateKey); input.focus({ preventScroll: true }); },
    focus() { input.focus({ preventScroll: true }); },
    shouldConfirmExit() { return state.mode === "random" && !state.done && state.guesses.length > 0; },
  };
}
