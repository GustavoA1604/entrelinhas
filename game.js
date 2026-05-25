import { ANSWERS } from "./answers.js";
import { VALID } from "./valid.js";

const MAX_GUESSES = 15;
const STORAGE_KEY = "entrelinhas:daily";
const SENTINEL_LOW = "aaaaa";
const SENTINEL_HIGH = "zzzzz";

// Sorted array of valid words for distance / range queries
const VALID_SORTED = [...VALID].sort();

const $ = (id) => document.getElementById(id);
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
const modeToggle = $("mode-toggle");
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
  guesses: [],         // [{word, side: 'upper'|'lower'|'hit'}]
  currentLower: SENTINEL_LOW,
  currentUpper: SENTINEL_HIGH,
  done: false,
  won: false,
  dateKey: null,
};

// --- helpers ---

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
function pickTarget(seed) {
  const rng = seed ? seededRng(seed) : Math.random;
  return ANSWERS[Math.floor(rng() * ANSWERS.length)];
}
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
// First index i where arr[i] > x
function upperBoundIdx(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= x) lo = m + 1; else hi = m;
  }
  return lo;
}
// Count of words in VALID strictly between a and b (a < b)
function distanceBetween(a, b) {
  if (!(a < b)) return 0;
  const i = upperBoundIdx(VALID_SORTED, a);
  const j = lowerBoundIdx(VALID_SORTED, b);
  return Math.max(0, j - i);
}

function pluralWords(n) {
  return n === 1 ? "1 palavra" : `${n.toLocaleString("pt-BR")} palavras`;
}

// --- bounds derivation ---

function recomputeBounds() {
  let lo = SENTINEL_LOW, up = SENTINEL_HIGH;
  for (const g of state.guesses) {
    if (g.side === "lower" && g.word > lo) lo = g.word;
    else if (g.side === "upper" && g.word < up) up = g.word;
  }
  state.currentLower = lo;
  state.currentUpper = up;
}

// Can any 5-letter string starting with prefix+c lie strictly between currentLower and currentUpper?
function isLetterValid(prefix, c) {
  const k = prefix.length;
  if (k >= 5) return false;
  const pad = 5 - k - 1;
  const prefixLo = prefix + c + "a".repeat(pad);
  const prefixHi = prefix + c + "z".repeat(pad);
  return prefixHi > state.currentLower && prefixLo < state.currentUpper;
}

// --- rendering ---

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
  // Lower bound row (TOP — words alphabetically before the target)
  if (state.currentLower === SENTINEL_LOW) {
    makeRowContent(lowerRow, SENTINEL_LOW, "bound-sentinel", "?? palavras");
  } else {
    const d = distanceBetween(state.currentLower, state.target);
    makeRowContent(lowerRow, state.currentLower, "bound-guess lower", pluralWords(d));
  }

  // Target row (middle)
  if (state.done && state.won) {
    makeRowContent(targetRow, state.target, "target target-revealed-win", "acertou!");
  } else if (state.done) {
    makeRowContent(targetRow, state.target, "target target-revealed-loss", "era esta");
  } else {
    makeRowContent(targetRow, "?????", "target target-hidden", "secreta");
  }

  // Upper bound row (BOTTOM — words alphabetically after the target)
  if (state.currentUpper === SENTINEL_HIGH) {
    makeRowContent(upperRow, SENTINEL_HIGH, "bound-sentinel", "?? palavras");
  } else {
    const d = distanceBetween(state.target, state.currentUpper);
    makeRowContent(upperRow, state.currentUpper, "bound-guess upper", pluralWords(d));
  }

  // Just-added animation
  for (const row of [lowerRow, upperRow, targetRow]) {
    row.classList.remove("just-added");
  }
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

// --- game flow ---

function startGame(mode) {
  state.mode = mode;
  state.guesses = [];
  state.currentLower = SENTINEL_LOW;
  state.currentUpper = SENTINEL_HIGH;
  state.done = false;
  state.won = false;

  if (mode === "daily") {
    state.dateKey = todayKey();
    state.target = pickTarget(state.dateKey);
    puzzleLabel.textContent = "Palavra do dia";
    puzzleDate.textContent = formatDate(state.dateKey);
    modeToggle.textContent = "Aleatório";
    const saved = loadDaily();
    if (saved && saved.dateKey === state.dateKey && saved.target === state.target) {
      state.guesses = saved.guesses || [];
      state.done = !!saved.done;
      state.won = !!saved.won;
      recomputeBounds();
    }
  } else {
    state.dateKey = null;
    state.target = pickTarget(null);
    puzzleLabel.textContent = "Modo aleatório";
    puzzleDate.textContent = "";
    modeToggle.textContent = "Palavra do dia";
  }

  setMessage("");
  input.value = "";
  input.disabled = state.done;
  render();
  if (state.done) showEndDialog();
}

function loadDaily() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}

function saveDaily() {
  if (state.mode !== "daily") return;
  const payload = {
    dateKey: state.dateKey,
    target: state.target,
    guesses: state.guesses,
    done: state.done,
    won: state.won,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
}

function submitGuess(raw) {
  if (state.done) return;
  const word = normalize(raw);

  if (!/^[a-z]{5}$/.test(word)) {
    setMessage("Use 5 letras (a–z).", "error");
    return;
  }
  if (!VALID.has(word)) {
    setMessage(`"${word}" não está no dicionário.`, "error");
    return;
  }
  if (state.guesses.some((g) => g.word === word)) {
    setMessage("Você já tentou essa palavra.", "error");
    return;
  }
  // Block guesses outside current known bounds
  if (word !== state.target && !(word > state.currentLower && word < state.currentUpper)) {
    setMessage(`"${word}" está fora dos limites atuais.`, "error");
    return;
  }

  let side;
  if (word === state.target) {
    side = "hit";
    state.done = true;
    state.won = true;
  } else if (word > state.target) {
    side = "upper";
  } else {
    side = "lower";
  }
  state.guesses.push({ word, side });
  recomputeBounds();

  if (!state.won && state.guesses.length >= MAX_GUESSES) {
    state.done = true;
    state.won = false;
  }

  input.value = "";
  setMessage("");
  saveDaily();
  render(word);

  if (state.done) {
    setTimeout(showEndDialog, 350);
    input.disabled = true;
  }
}

function showEndDialog() {
  if (state.won) {
    endTitle.textContent = "Você acertou! 🎉";
    endBody.textContent = `A palavra era "${state.target}". Você usou ${state.guesses.length} tentativa${state.guesses.length === 1 ? "" : "s"}.`;
  } else {
    endTitle.textContent = "Fim de jogo";
    endBody.textContent = `A palavra era "${state.target}".`;
  }
  if (typeof endDialog.showModal === "function") endDialog.showModal();
}

function buildShareText() {
  const header = state.mode === "daily"
    ? `Entrelinhas ${formatDate(state.dateKey)}`
    : "Entrelinhas (aleatório)";
  const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const blocks = state.guesses
    .map((g) => (g.side === "hit" ? "🟩" : g.side === "upper" ? "🔽" : "🔼"))
    .join("");
  return `${header} ${score}\n${blocks}`;
}

async function share() {
  const text = buildShareText();
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch {}
  }
  try {
    await navigator.clipboard.writeText(text);
    setMessage("Resultado copiado!", "success");
  } catch {
    setMessage("Não consegui copiar — selecione e copie manualmente.", "error");
  }
}

// --- wiring ---

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitGuess(input.value);
});

input.addEventListener("input", () => {
  // Live-strip invalid chars so the prefix used by the hint stays clean.
  const cleaned = normalize(input.value).slice(0, 5);
  if (cleaned !== input.value) input.value = cleaned;
  renderAlphabet();
});

modeToggle.addEventListener("click", () => {
  startGame(state.mode === "daily" ? "random" : "daily");
});

helpBtn.addEventListener("click", () => {
  if (typeof helpDialog.showModal === "function") helpDialog.showModal();
});

shareBtn.addEventListener("click", share);
playAgainBtn.addEventListener("click", () => {
  endDialog.close();
  startGame("random");
});

if (!localStorage.getItem("entrelinhas:seen-help")) {
  localStorage.setItem("entrelinhas:seen-help", "1");
  setTimeout(() => helpDialog.showModal?.(), 200);
}

startGame("daily");
input.focus();
