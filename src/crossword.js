import { ANSWERS } from "./data/answers.js";
import { VALID } from "./data/valid.js";
import {
  SENTINEL_LOW,
  SENTINEL_HIGH,
  normalize,
  pluralWords,
  prefixFitsGaps,
} from "./dictionary.js";
import { formatDate, seededRng } from "./daily.js";
import { migrateLegacyDaily } from "./storage.js";
import { computeCrosswordList, pruneRows, totalUnsolvedDistance } from "./crossword-list.js";
import { createGameController } from "./game-shell.js";

// === Tunables ===
export const NUM_SECRETS = 5;
const MAX_GUESSES = 50;
const STORAGE_PREFIX = "entrelinhas:crossword-daily:";
export const CROSSWORD_STORAGE_PREFIX = STORAGE_PREFIX;

// One-time migration of the legacy single-slot key into a per-date entry.
migrateLegacyDaily("entrelinhas:crossword-daily", STORAGE_PREFIX);

const GEN_MAX_ATTEMPTS = 300;
const HINT_TIPS = [
  { rangeMax: 500, idleMs: 10_000 },
  { rangeMax: 100, idleMs: 20_000 },
  { rangeMax: 30, idleMs: 30_000 },
];

const ANSWER_POOL = ANSWERS.filter((w) => w.length === 5);

// === Helpers ===
const $ = (id) => document.getElementById(id);
function pluralSecretas(n) {
  return n === 1 ? "1 secreta" : `${n.toLocaleString("pt-BR")} secretas`;
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
// Weighted random pick: bias toward placements with more crossings (loops).
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
export function generateCrossword(seed) {
  const rng = seed ? seededRng(seed) : Math.random;
  for (let i = 0; i < GEN_MAX_ATTEMPTS; i++) {
    const r = tryGenerate(rng, NUM_SECRETS);
    if (r) return r;
  }
  // Should be rare. Keep trying with fresh fallback seeds, shrinking the puzzle
  // as a last resort so we never return null (a single word always places).
  for (let target = NUM_SECRETS; target >= 1; target--) {
    for (let i = 0; i < GEN_MAX_ATTEMPTS; i++) {
      const r = tryGenerate(seededRng(`fallback:${target}:${i}`), target);
      if (r) return r;
    }
  }
}

// === Public init ===
export function initCrossword(callbacks = {}) {
  const grid = $("cw-grid");
  const list = $("cw-list");
  const input = $("cw-guess-input");
  const alphaHint = $("cw-alpha-hint");
  const guessesLeftEl = $("cw-guesses-left");
  const solvedCountEl = $("cw-solved-count");
  const totalCountEl = $("cw-total-count");
  const hintsEl = $("cw-hints");

  // --- List computation (see crossword-list.js for the pure logic) ---
  function computeList(state) {
    return computeCrosswordList({
      secretsSorted: state.secretsSorted,
      solvedSet: state.solvedSet,
      guessWords: state.guesses.map((g) => g.word),
    });
  }
  function totalDistance(state) {
    return totalUnsolvedDistance({
      secretsSorted: state.secretsSorted,
      solvedSet: state.solvedSet,
      guessWords: state.guesses.map((g) => g.word),
    });
  }
  function isWordInLiveGap(word, liveGaps) {
    for (const [gLo, gHi] of liveGaps) {
      if (word > gLo && word < gHi) return true;
    }
    return false;
  }
  function revealedSet(state) {
    return new Set(state.tipsRevealed.map((t) => `${t.pos[0]},${t.pos[1]}`));
  }

  // --- Rendering ---
  function renderGrid(state) {
    grid.innerHTML = "";
    if (state.placed.length === 0) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
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
    const revealed = revealedSet(state);

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
        cur.ox = ocx;
        cur.oy = ocy;
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
          div.textContent = c.solved || isRevealed ? c.letter.toUpperCase() : "";
        }
        grid.appendChild(div);
      }
    }
  }

  function renderList(state) {
    const { rows } = computeList(state);
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
        el.className = "cw-row cw-guess" + (r.solved ? " cw-guess-solved" : "");
        const tags = [];
        if (r.upDist != null)
          tags.push(`<span class="tag tag-up">↑ ${pluralWords(r.upDist)}</span>`);
        if (r.downDist != null)
          tags.push(`<span class="tag tag-down">↓ ${pluralWords(r.downDist)}</span>`);
        const mark = r.solved ? '<span class="cw-guess-check" aria-label="acertada">✓</span> ' : "";
        el.innerHTML = `<span class="word">${mark}${r.word}</span><span class="tags">${tags.join("")}</span>`;
      }
      list.appendChild(el);
    }
  }

  function renderAlphabet(state) {
    const prefix = normalize(input.value);
    const { liveGaps } = computeList(state);
    alphaHint.innerHTML = "";
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(97 + i);
      const span = document.createElement("span");
      span.className = "letter " + (prefixFitsGaps(prefix, c, liveGaps) ? "enabled" : "disabled");
      span.textContent = c;
      alphaHint.appendChild(span);
    }
  }

  function renderBoard(state) {
    renderGrid(state);
    renderList(state);
    renderAlphabet(state);
    // The revealed letter shows up directly in the grid, so no hint banner.
    hintsEl.innerHTML = "";
    guessesLeftEl.textContent = MAX_GUESSES - state.guesses.length;
    solvedCountEl.textContent = state.solvedSet.size;
    totalCountEl.textContent = state.secrets.length;
  }

  // --- Hint selection ---
  function stopSelecting(state, api) {
    const wasSelecting = state.selectingTip;
    state.selectingTip = false;
    grid.classList.remove("cw-selecting");
    if (wasSelecting) api.setMessage("");
    api.updateHintButton();
  }
  function revealCellAt(state, api, ox, oy) {
    state.tipsRevealed.push({ pos: [ox, oy], afterGuess: state.guesses.length });
    state.tipStartRange = api.currentRange();
    stopSelecting(state, api);
    api.save();
    api.render();
    api.updateHintButton();
  }

  // --- Summary ---
  function buildEventLines(state) {
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
        lines.push(`✅ ${solvedRank}ª palavra em ${n} tentativa${n === 1 ? "" : "s"}`);
      }
      emitTipsAfter(i + 1);
    }
    const missing = state.secrets.length - state.solvedSet.size;
    if (missing > 0) {
      lines.push(`❌ Faltaram ${missing} palavra${missing === 1 ? "" : "s"}`);
    }
    return lines;
  }

  function scoreText(state) {
    return `${state.solvedSet.size}/${state.secrets.length} em ${state.guesses.length}/${MAX_GUESSES}`;
  }

  return createGameController({
    mode: "crossword",
    maxGuesses: MAX_GUESSES,
    storagePrefix: STORAGE_PREFIX,
    hintTips: HINT_TIPS,
    dailyTitle: "Cruzadas do dia",
    hintRangeWord: "distância",
    exitModeNoun: "nas Cruzadas",
    copyErrors: {
      result: "Não foi possível copiar o resultado.",
      link: "Não foi possível copiar o link.",
    },
    callbacks,
    els: {
      input,
      form: $("cw-guess-form"),
      guessBtn: $("cw-guess-btn"),
      hintBtn: $("cw-hint-btn"),
      guessesTotal: $("cw-guesses-total"),
      puzzleLabel: $("cw-puzzle-label"),
      puzzleDate: $("cw-puzzle-date"),
      endDialog: $("cw-end-dialog"),
      endTitle: $("cw-end-title"),
      endBody: $("cw-end-body"),
      shareBtn: $("cw-share-btn"),
      playAgainBtn: $("cw-play-again-btn"),
      endMenuBtn: $("cw-end-menu-btn"),
      crossModeBtn: $("cw-cross-mode-btn"),
      view: $("crossword-view"),
    },

    initState(state) {
      state.placed = [];
      state.secrets = []; // lowercase, in placement order
      state.secretsSorted = []; // sorted alphabetic copy
      state.solvedSet = new Set();
      state.selectingTip = false;
    },
    resetState(state) {
      state.solvedSet = new Set();
      state.selectingTip = false;
      grid.classList.remove("cw-selecting");
    },
    createPuzzle(state) {
      const seed =
        state.mode === "daily" ? `crossword:${state.dateKey}` : `crossword:random:${state.seed}`;
      const puzzle = generateCrossword(seed);
      state.placed = puzzle.placed;
      state.secrets = puzzle.placed.map((p) => p.word);
      state.secretsSorted = [...state.secrets].sort();
    },
    restoreDaily(state, saved) {
      if (
        !(
          saved &&
          saved.dateKey === state.dateKey &&
          Array.isArray(saved.secrets) &&
          saved.secrets.length === NUM_SECRETS
        )
      )
        return false;
      state.placed = saved.placed;
      state.secrets = saved.secrets;
      state.secretsSorted = [...state.secrets].sort();
      state.guesses = saved.guesses || [];
      state.solvedSet = new Set(saved.solved || []);
      state.done = !!saved.done;
      state.won = !!saved.won;
      state.tipsRevealed = Array.isArray(saved.tipsRevealed) ? saved.tipsRevealed : [];
      if (typeof saved.tipStartRange === "number") state.tipStartRange = saved.tipStartRange;
      return true;
    },
    serialize(state) {
      return {
        secrets: state.secrets,
        placed: state.placed,
        solved: [...state.solvedSet],
      };
    },
    currentRange(state) {
      return totalDistance(state);
    },

    applyGuess(word, state) {
      if (!VALID.has(word) && !state.secrets.includes(word))
        return { error: `"${word}" não está no dicionário.` };
      if (state.guesses.some((g) => g.word === word))
        return { error: "Você já tentou essa palavra." };
      const isSecret = state.secrets.includes(word) && !state.solvedSet.has(word);
      if (!isSecret) {
        const { liveGaps } = computeList(state);
        if (!isWordInLiveGap(word, liveGaps))
          return { error: `"${word}" está fora dos limites atuais.` };
      }

      state.guesses.push({ word, isSecret });
      state.lastGuessAt = Date.now();
      if (isSecret) state.solvedSet.add(word);
      if (state.solvedSet.size === state.secrets.length) {
        state.done = true;
        state.won = true;
      } else if (state.guesses.length >= MAX_GUESSES) {
        state.done = true;
        state.won = false;
      }
      return {
        message: isSecret ? "Acertou uma! 🎉" : "",
        messageKind: isSecret ? "success" : "",
      };
    },

    renderBoard,
    renderAlphabet,

    isSelecting(state) {
      return state.selectingTip;
    },
    onHintClickStart(state, api) {
      if (state.selectingTip) {
        stopSelecting(state, api);
        return true;
      }
      return false;
    },
    revealHint(state, api) {
      state.selectingTip = true;
      grid.classList.add("cw-selecting");
      api.setMessage("Toque em uma letra do tabuleiro para revelar (Esc para cancelar).", "");
      api.updateHintButton();
    },
    hintRangeToast() {
      return "Chegue mais próximo da resposta para liberar a próxima dica";
    },

    endTitle(state) {
      return state.won ? "Você completou! 🎉" : "Fim de jogo";
    },
    endInfo(state) {
      return `${scoreText(state)} · Palavras: ${state.secretsSorted.join(", ")}.`;
    },
    buildSummary(state) {
      return buildEventLines(state);
    },
    buildShareText(state, shareUrl) {
      const header =
        state.mode === "daily"
          ? `Entrelinhas Cruzadas ${formatDate(state.dateKey)}`
          : "Entrelinhas Cruzadas (aleatório)";
      const events = buildEventLines(state).join("\n");
      // The link reopens this exact puzzle (same date, or same random seed).
      return `${header}\n${scoreText(state)}\n\n${events}\n\nJogue este: ${shareUrl}`;
    },

    wire(api) {
      grid.addEventListener("click", (e) => {
        if (!api.state.selectingTip) return;
        const cell = e.target.closest(".cw-cell");
        if (!cell || cell.classList.contains("cw-empty")) return;
        if (cell.classList.contains("cw-solved") || cell.classList.contains("cw-revealed")) return;
        const ox = Number(cell.dataset.ox),
          oy = Number(cell.dataset.oy);
        if (!Number.isFinite(ox) || !Number.isFinite(oy)) return;
        revealCellAt(api.state, api, ox, oy);
      });
      // Tapping a secret "?????" row in the list focuses the guess input (and, on
      // mobile, pops the keyboard, since this runs inside a user gesture).
      list.addEventListener("click", (e) => {
        if (input.disabled) return;
        if (e.target.closest(".cw-group")) input.focus({ preventScroll: true });
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && api.state.selectingTip) stopSelecting(api.state, api);
      });
    },
  });
}
