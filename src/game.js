import { ANSWERS } from "./data/answers.js";
import { VALID } from "./data/valid.js";

const MAX_GUESSES = 15;
const HINT_TIPS = [
  { id: "last",       rangeMax: 100, idleMs: 10_000 },
  { id: "secondLast", rangeMax: 15,  idleMs: 30_000 },
];
const STORAGE_PREFIX = "entrelinhas:daily:";
export const CLASSIC_STORAGE_PREFIX = STORAGE_PREFIX;
export const DAILY_EPOCH = "2026-05-25";

// One-time migration of the legacy single-slot key into a per-date entry.
try {
  const legacy = JSON.parse(localStorage.getItem("entrelinhas:daily") || "null");
  if (legacy && typeof legacy === "object" && legacy.dateKey) {
    if (!localStorage.getItem(STORAGE_PREFIX + legacy.dateKey)) {
      localStorage.setItem(STORAGE_PREFIX + legacy.dateKey, JSON.stringify(legacy));
    }
    localStorage.removeItem("entrelinhas:daily");
  }
} catch {}
const SENTINEL_LOW = "aaaaa";
const SENTINEL_HIGH = "zzzzz";

// Sorted array of valid words for distance and range queries
const VALID_SORTED = [...VALID].sort();

const $ = (id) => document.getElementById(id);

function stripAccents(s) { return s.normalize("NFD").replace(/\p{M}/gu, ""); }
function normalize(s) { return stripAccents(s).toLowerCase().trim(); }

// Binary search: first index i where arr[i] >= x
function lowerBoundIdx(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < x) lo = m + 1; else hi = m;
  }
  return lo;
}
function upperBoundIdx(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= x) lo = m + 1; else hi = m;
  }
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
function pickTarget(seed) {
  const rng = seed ? seededRng(seed) : Math.random;
  return ANSWERS[Math.floor(rng() * ANSWERS.length)];
}

export function initClassic({ onBack } = {}) {
  const lowerRow = $("lower-row");
  const targetRow = $("target-row");
  const upperRow = $("upper-row");
  const alphaHint = $("alpha-hint");
  const input = $("guess-input");
  const form = $("guess-form");
  const msg = $("message");
  const guessesLeft = $("guesses-left");
  const puzzleLabel = $("puzzle-label");
  const puzzleDate = $("puzzle-date");
  const hintBtn = $("hint-btn");
  const hintsEl = $("hints");
  const helpBtn = $("help-btn");
  const helpDialog = $("help-dialog");
  const endDialog = $("end-dialog");
  const endTitle = $("end-title");
  const endBody = $("end-body");
  const shareBtn = $("share-btn");
  const playAgainBtn = $("play-again-btn");

  const state = {
    mode: "daily",
    target: null,
    guesses: [],
    currentLower: SENTINEL_LOW,
    currentUpper: SENTINEL_HIGH,
    done: false,
    won: false,
    dateKey: null,
    isHistorical: false,
    tipsRevealed: [],
    lastGuessAt: Date.now(),
  };

  function recomputeBounds() {
    let lo = SENTINEL_LOW, up = SENTINEL_HIGH;
    for (const g of state.guesses) {
      if (g.side === "lower" && g.word > lo) lo = g.word;
      else if (g.side === "upper" && g.word < up) up = g.word;
    }
    state.currentLower = lo;
    state.currentUpper = up;
  }

  function isLetterValid(prefix, c) {
    const k = prefix.length;
    if (k >= 5) return false;
    const pad = 5 - k - 1;
    const prefixLo = prefix + c + "a".repeat(pad);
    const prefixHi = prefix + c + "z".repeat(pad);
    return prefixHi > state.currentLower && prefixLo < state.currentUpper;
  }

  function makeRowContent(row, word, classes, tagText) {
    row.className = "row " + classes;
    row.innerHTML = "";
    const wordSpan = document.createElement("span");
    wordSpan.className = "word";
    wordSpan.textContent = word;
    row.appendChild(wordSpan);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = tagText;
    row.appendChild(tag);
  }

  function render(justAddedWord = null) {
    if (state.currentLower === SENTINEL_LOW) {
      makeRowContent(lowerRow, SENTINEL_LOW, "bound-sentinel", "?? palavras");
    } else {
      const d = distanceBetween(state.currentLower, state.target);
      makeRowContent(lowerRow, state.currentLower, "bound-guess lower", pluralWords(d));
    }

    if (state.done && state.won) {
      makeRowContent(targetRow, state.target, "target target-revealed-win", "acertou!");
    } else if (state.done) {
      makeRowContent(targetRow, state.target, "target target-revealed-loss", "era esta");
    } else {
      makeRowContent(targetRow, "?????", "target target-hidden", "secreta");
    }

    if (state.currentUpper === SENTINEL_HIGH) {
      makeRowContent(upperRow, SENTINEL_HIGH, "bound-sentinel", "?? palavras");
    } else {
      const d = distanceBetween(state.target, state.currentUpper);
      makeRowContent(upperRow, state.currentUpper, "bound-guess upper", pluralWords(d));
    }

    for (const row of [lowerRow, upperRow, targetRow]) row.classList.remove("just-added");
    if (justAddedWord) {
      if (justAddedWord === state.target) targetRow.classList.add("just-added");
      else if (state.currentLower === justAddedWord) lowerRow.classList.add("just-added");
      else if (state.currentUpper === justAddedWord) upperRow.classList.add("just-added");
    }

    guessesLeft.textContent = MAX_GUESSES - state.guesses.length;
    renderAlphabet();
  }

  function renderAlphabet() {
    const prefix = normalize(input.value);
    alphaHint.innerHTML = "";
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(97 + i);
      const span = document.createElement("span");
      span.className = "letter " + (isLetterValid(prefix, c) ? "enabled" : "disabled");
      span.textContent = c;
      alphaHint.appendChild(span);
    }
  }

  function setMessage(text, kind = "") {
    msg.textContent = text;
    msg.className = "message" + (kind ? " " + kind : "");
  }

  function startGame(mode, customDateKey) {
    if (endDialog.open) endDialog.close();
    state.mode = mode;
    state.guesses = [];
    state.currentLower = SENTINEL_LOW;
    state.currentUpper = SENTINEL_HIGH;
    state.done = false;
    state.won = false;
    state.tipsRevealed = [];
    state.lastGuessAt = Date.now();

    if (mode === "daily") {
      const today = todayKey();
      state.dateKey = customDateKey || today;
      state.isHistorical = state.dateKey !== today;
      state.target = pickTarget(state.dateKey);
      puzzleLabel.textContent = "Palavra do dia";
      puzzleDate.textContent = formatDate(state.dateKey);
      const saved = loadDaily(state.dateKey);
      if (saved && saved.dateKey === state.dateKey && saved.target === state.target) {
        state.guesses = saved.guesses || [];
        state.done = !!saved.done;
        state.won = !!saved.won;
        state.tipsRevealed = Array.isArray(saved.tipsRevealed)
          ? saved.tipsRevealed.map((t) => typeof t === "string" ? { id: t, afterGuess: 0 } : t)
          : [];
        recomputeBounds();
      }
    } else {
      state.dateKey = null;
      state.isHistorical = false;
      state.target = pickTarget(null);
      puzzleLabel.textContent = "Modo aleatório";
      puzzleDate.textContent = "";
    }

    setMessage("");
    input.value = "";
    input.disabled = state.done;
    renderHints();
    updateHintButton();
    render();
    if (state.done) showEndDialog();
  }

  function tipText(id) {
    if (id === "last")       return `Dica: a palavra termina com "${state.target[4]}".`;
    if (id === "secondLast") return `Dica: a penúltima letra é "${state.target[3]}".`;
    return "Dica.";
  }
  function renderHints() {
    hintsEl.innerHTML = "";
    for (const t of state.tipsRevealed) {
      const div = document.createElement("div");
      div.className = "hint-banner";
      div.textContent = tipText(t.id);
      hintsEl.appendChild(div);
    }
  }

  function updateHintButton() {
    if (state.done) { hintBtn.disabled = true; hintBtn.classList.remove("ready"); return; }
    const next = HINT_TIPS[state.tipsRevealed.length];
    if (!next) { hintBtn.disabled = true; hintBtn.classList.remove("ready"); return; }
    const range = distanceBetween(state.currentLower, state.currentUpper);
    const idle = Date.now() - state.lastGuessAt;
    const ready = range <= next.rangeMax && idle >= next.idleMs;
    hintBtn.disabled = !ready;
    hintBtn.classList.toggle("ready", ready);
  }

  function loadDaily(dateKey) {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + dateKey) || "null"); } catch { return null; }
  }
  function saveDaily() {
    if (state.mode !== "daily") return;
    const payload = { dateKey: state.dateKey, target: state.target, guesses: state.guesses, done: state.done, won: state.won, tipsRevealed: state.tipsRevealed };
    try { localStorage.setItem(STORAGE_PREFIX + state.dateKey, JSON.stringify(payload)); } catch {}
  }

  function submitGuess(raw) {
    if (state.done) return;
    const word = normalize(raw);
    const fail = (text) => { setMessage(text, "error"); input.focus({ preventScroll: true }); };
    if (!/^[a-z]{5}$/.test(word)) { fail("Use 5 letras (a–z)."); return; }
    if (!VALID.has(word)) { fail(`"${word}" não está no dicionário.`); return; }
    if (state.guesses.some((g) => g.word === word)) { fail("Você já tentou essa palavra."); return; }
    if (word !== state.target && !(word > state.currentLower && word < state.currentUpper)) {
      fail(`"${word}" está fora dos limites atuais.`);
      return;
    }

    let side;
    if (word === state.target) { side = "hit"; state.done = true; state.won = true; }
    else if (word > state.target) side = "upper";
    else side = "lower";
    state.guesses.push({ word, side });
    state.lastGuessAt = Date.now();
    recomputeBounds();

    if (!state.won && state.guesses.length >= MAX_GUESSES) { state.done = true; state.won = false; }

    input.value = "";
    setMessage("");
    saveDaily();
    render(word);
    updateHintButton();

    if (state.done) {
      input.disabled = true;
      setTimeout(showEndDialog, 350);
    } else {
      input.focus({ preventScroll: true });
    }
  }

  function buildSummaryLines({ includeWords } = { includeWords: true }) {
    const n = state.guesses.length;
    const lines = [];
    let lo = SENTINEL_LOW, hi = SENTINEL_HIGH;
    const fmt = (x) => x.toLocaleString("pt-BR");
    const tipLine = (id) => {
      if (!includeWords) return "💡 Dica usada";
      if (id === "last")       return `💡 Dica: última letra "${state.target[4]}"`;
      if (id === "secondLast") return `💡 Dica: penúltima letra "${state.target[3]}"`;
      return "💡 Dica";
    };
    const emitTipsAfter = (k) => {
      for (const t of state.tipsRevealed) {
        if (t.afterGuess === k) lines.push(tipLine(t.id));
      }
    };
    emitTipsAfter(0);
    for (let i = 0; i < state.guesses.length; i++) {
      const g = state.guesses[i];
      if (g.side === "lower" && g.word > lo) lo = g.word;
      else if (g.side === "upper" && g.word < hi) hi = g.word;
      const lowerDist = distanceBetween(lo, state.target);
      const upperDist = distanceBetween(state.target, hi);
      const arrow = g.side === "hit" ? "🟩" : g.side === "lower" ? "🔼" : "🔽";
      const word = includeWords ? ` ${g.word}` : "";
      if (g.side === "hit") {
        lines.push(`${arrow}${word}  Sucesso em ${n} tentativa${n === 1 ? "" : "s"}`);
      } else {
        lines.push(`${arrow}${word}  ${fmt(lowerDist)} - ${fmt(upperDist)}`);
      }
      emitTipsAfter(i + 1);
    }
    if (!state.won) lines.push(`❌ Não consegui em ${MAX_GUESSES} tentativas`);
    return lines;
  }

  function modeLabel() {
    return state.mode === "daily" ? `Palavra do dia (${formatDate(state.dateKey)})` : "Modo aleatório";
  }

  function showEndDialog() {
    endTitle.textContent = state.won ? "Você acertou! 🎉" : "Fim de jogo";
    endBody.innerHTML = "";
    const info = document.createElement("p");
    info.textContent = `${modeLabel()} · a palavra era "${state.target}".`;
    info.style.margin = "0 0 10px";
    endBody.appendChild(info);
    const pre = document.createElement("pre");
    pre.className = "summary";
    pre.textContent = buildSummaryLines().join("\n");
    endBody.appendChild(pre);
    if (typeof endDialog.showModal === "function") endDialog.showModal();
  }

  function buildShareText() {
    const header = state.mode === "daily" ? `Entrelinhas ${formatDate(state.dateKey)}` : "Entrelinhas (aleatório)";
    const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    return `${header} ${score}\n${buildSummaryLines({ includeWords: false }).join("\n")}`;
  }

  async function share() {
    const text = buildShareText();
    if (navigator.share) { try { await navigator.share({ text }); return; } catch {} }
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Resultado copiado!", "success");
    } catch {
      setMessage("Não consegui copiar. Selecione e copie manualmente.", "error");
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(input.value); });
  const guessBtn = $("guess-btn");
  guessBtn.addEventListener("click", (e) => { e.preventDefault(); if (!input.disabled) form.requestSubmit(); });
  input.addEventListener("input", () => {
    const cleaned = normalize(input.value).slice(0, 5);
    if (cleaned !== input.value) input.value = cleaned;
    renderAlphabet();
  });
  hintBtn.addEventListener("click", () => {
    if (state.done) return;
    const next = HINT_TIPS[state.tipsRevealed.length];
    if (!next) return;
    const range = distanceBetween(state.currentLower, state.currentUpper);
    const idle = Date.now() - state.lastGuessAt;
    if (range > next.rangeMax || idle < next.idleMs) return;
    state.tipsRevealed.push({ id: next.id, afterGuess: state.guesses.length });
    renderHints();
    updateHintButton();
    saveDaily();
  });
  setInterval(updateHintButton, 500);
  helpBtn.addEventListener("click", () => { if (typeof helpDialog.showModal === "function") helpDialog.showModal(); });
  shareBtn.addEventListener("click", share);
  playAgainBtn.addEventListener("click", () => { endDialog.close(); startGame("random"); });

  function maybeRolloverDaily() {
    if (state.mode === "daily" && !state.isHistorical && state.dateKey && state.dateKey !== todayKey()) startGame("daily");
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeRolloverDaily(); });
  window.addEventListener("focus", maybeRolloverDaily);

  return {
    start(mode, dateKey) {
      startGame(mode, dateKey);
      input.focus({ preventScroll: true });
    },
    focus() { input.focus({ preventScroll: true }); },
    shouldConfirmExit() { return state.mode === "random" && !state.done && state.guesses.length > 0; },
  };
}
