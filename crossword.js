import { ANSWERS } from "./answers.js";
import { VALID } from "./valid.js";

// === Tunables ===
const NUM_SECRETS = 5;
const MAX_GUESSES = 50;
const STORAGE_KEY = "entrelinhas:crossword-daily";
const SENTINEL_LOW = "aaaaa";
const SENTINEL_HIGH = "zzzzz";
const GEN_MAX_ATTEMPTS = 300;

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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const msg = $("cw-message");
  const alphaHint = $("cw-alpha-hint");
  const guessesLeftEl = $("cw-guesses-left");
  const solvedCountEl = $("cw-solved-count");
  const totalCountEl = $("cw-total-count");
  const puzzleLabel = $("cw-puzzle-label");
  const puzzleDate = $("cw-puzzle-date");
  const modeToggle = $("cw-mode-toggle");
  const helpBtn = $("cw-help-btn");
  const helpDialog = $("cw-help-dialog");
  const endDialog = $("cw-end-dialog");
  const endTitle = $("cw-end-title");
  const endBody = $("cw-end-body");
  const shareBtn = $("cw-share-btn");
  const playAgainBtn = $("cw-play-again-btn");

  const state = {
    mode: "daily",
    dateKey: null,
    placed: [],
    secrets: [],            // lowercase, in placement order
    secretsSorted: [],      // sorted alphabetic copy
    solvedSet: new Set(),
    guesses: [],            // { word, isSecret }
    done: false,
    won: false,
  };

  function setMessage(text, kind = "") {
    msg.textContent = text;
    msg.className = "message" + (kind ? " " + kind : "");
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

    // cells[y][x] = { letter, solved }
    const cells = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
    for (const p of state.placed) {
      const isSolved = state.solvedSet.has(p.word);
      for (let i = 0; i < p.word.length; i++) {
        const cx = (p.dir === "H" ? p.x + i : p.x) - minX;
        const cy = (p.dir === "H" ? p.y : p.y + i) - minY;
        const cur = cells[cy][cx] || { letter: p.word[i], solved: false };
        cur.letter = p.word[i];
        cur.solved = cur.solved || isSolved;
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
          div.className = "cw-cell" + (c.solved ? " cw-solved" : "");
          div.textContent = c.solved ? c.letter.toUpperCase() : "";
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
    guessesLeftEl.textContent = MAX_GUESSES - state.guesses.length;
    solvedCountEl.textContent = state.solvedSet.size;
    totalCountEl.textContent = state.secrets.length;
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

    if (state.done) {
      input.disabled = true;
      setTimeout(showEndDialog, 350);
    } else {
      input.focus({ preventScroll: true });
    }
  }

  function loadDaily() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
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
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
  }

  function startGame(mode) {
    if (endDialog.open) endDialog.close();
    state.mode = mode;
    state.guesses = [];
    state.solvedSet = new Set();
    state.done = false;
    state.won = false;

    let restored = false;
    if (mode === "daily") {
      state.dateKey = todayKey();
      const saved = loadDaily();
      if (saved && saved.dateKey === state.dateKey && Array.isArray(saved.secrets) && saved.secrets.length === NUM_SECRETS) {
        state.placed = saved.placed;
        state.secrets = saved.secrets;
        state.secretsSorted = [...state.secrets].sort();
        state.guesses = saved.guesses || [];
        state.solvedSet = new Set(saved.solved || []);
        state.done = !!saved.done;
        state.won = !!saved.won;
        restored = true;
      }
      puzzleLabel.textContent = "Cruzadas do dia";
      puzzleDate.textContent = formatDate(state.dateKey);
      modeToggle.textContent = "Aleatório";
    } else {
      state.dateKey = null;
      puzzleLabel.textContent = "Modo aleatório";
      puzzleDate.textContent = "";
      modeToggle.textContent = "Cruzadas do dia";
    }

    if (!restored) {
      const seed = mode === "daily" ? `crossword:${state.dateKey}` : null;
      const puzzle = generateCrossword(seed);
      state.placed = puzzle.placed;
      state.secrets = puzzle.placed.map((p) => p.word);
      state.secretsSorted = [...state.secrets].sort();
    }

    setMessage("");
    input.value = "";
    input.disabled = state.done;
    renderAll();
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
    if (typeof endDialog.showModal === "function") endDialog.showModal();
  }

  function buildGridText() {
    if (state.placed.length === 0) return "";
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
    const W = maxX - minX + 1, H = maxY - minY + 1;
    const cells = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
    for (const p of state.placed) {
      const isSolved = state.solvedSet.has(p.word);
      for (let i = 0; i < p.word.length; i++) {
        const cx = (p.dir === "H" ? p.x + i : p.x) - minX;
        const cy = (p.dir === "H" ? p.y : p.y + i) - minY;
        const cur = cells[cy][cx] || { letter: p.word[i], solved: false };
        cur.letter = p.word[i];
        cur.solved = cur.solved || isSolved;
        cells[cy][cx] = cur;
      }
    }
    const rows = [];
    for (let y = 0; y < H; y++) {
      let line = "";
      for (let x = 0; x < W; x++) {
        const c = cells[y][x];
        if (!c) line += "  ";
        else if (c.solved) line += c.letter.toUpperCase() + " ";
        else line += "· ";
      }
      rows.push(line.trimEnd());
    }
    return rows.join("\n");
  }

  function buildShareText() {
    const header = state.mode === "daily" ? `Entrelinhas Cruzadas ${formatDate(state.dateKey)}` : "Entrelinhas Cruzadas (aleatório)";
    const score = `${state.solvedSet.size}/${state.secrets.length} em ${state.guesses.length}/${MAX_GUESSES}`;
    const gridText = buildGridText();
    return `${header}\n${score}\n\n\`\`\`\n${gridText}\n\`\`\``;
  }
  async function share() {
    const text = buildShareText();
    if (navigator.share) { try { await navigator.share({ text }); return; } catch {} }
    try { await navigator.clipboard.writeText(text); setMessage("Resultado copiado!", "success"); }
    catch { setMessage("Não consegui copiar.", "error"); }
  }

  // --- Wiring ---
  form.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(input.value); });
  guessBtn.addEventListener("click", (e) => { e.preventDefault(); if (!input.disabled) form.requestSubmit(); });
  input.addEventListener("input", () => {
    const cleaned = normalize(input.value).slice(0, 5);
    if (cleaned !== input.value) input.value = cleaned;
    renderAlphabet();
  });
  modeToggle.addEventListener("click", () => { startGame(state.mode === "daily" ? "random" : "daily"); });
  helpBtn.addEventListener("click", () => { if (typeof helpDialog.showModal === "function") helpDialog.showModal(); });
  shareBtn.addEventListener("click", share);
  playAgainBtn.addEventListener("click", () => { endDialog.close(); startGame("random"); });

  return {
    start(mode) { startGame(mode); input.focus({ preventScroll: true }); },
    focus() { input.focus({ preventScroll: true }); },
  };
}
