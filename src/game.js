import { ANSWERS } from "./data/answers.js";
import { VALID } from "./data/valid.js";
import { showToast } from "./toast.js";
import { shareOrCopy } from "./share-helpers.js";
import {
  SENTINEL_LOW,
  SENTINEL_HIGH,
  normalize,
  distanceBetween,
  pluralWords,
} from "./dictionary.js";
import { todayKey, formatDate, seededRng, makeSeed } from "./daily.js";
import { readJSON, writeJSON, migrateLegacyDaily } from "./storage.js";
import { computeHintState } from "./hint.js";
import { buildShareUrl } from "./routes.js";

const MODE = "classic";
const MAX_GUESSES = 15;
const HINT_TIPS = [
  { id: "last", rangeMax: 100, idleMs: 10_000 },
  { id: "secondLast", rangeMax: 15, idleMs: 30_000 },
];
const STORAGE_PREFIX = "entrelinhas:daily:";
export const CLASSIC_STORAGE_PREFIX = STORAGE_PREFIX;
export const DAILY_EPOCH = "2026-05-25";

// One-time migration of the legacy single-slot key into a per-date entry.
migrateLegacyDaily("entrelinhas:daily", STORAGE_PREFIX);

const $ = (id) => document.getElementById(id);

function pickTarget(seed) {
  return ANSWERS[Math.floor(seededRng(seed)() * ANSWERS.length)];
}

export function initClassic({ onBack, onRoute } = {}) {
  const lowerRow = $("lower-row");
  const targetRow = $("target-row");
  const upperRow = $("upper-row");
  const alphaHint = $("alpha-hint");
  const input = $("guess-input");
  const form = $("guess-form");
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
  const endMenuBtn = $("end-menu-btn");

  const state = {
    mode: "daily",
    target: null,
    guesses: [],
    currentLower: SENTINEL_LOW,
    currentUpper: SENTINEL_HIGH,
    done: false,
    won: false,
    dateKey: null,
    seed: null,
    isHistorical: false,
    tipsRevealed: [],
    lastGuessAt: Date.now(),
    tipStartRange: null,
  };

  // Identifies the current game for routing and shareable links.
  function descriptor() {
    return state.mode === "daily"
      ? { mode: MODE, variant: "daily", param: state.dateKey }
      : { mode: MODE, variant: "random", param: state.seed };
  }

  function recomputeBounds() {
    let lo = SENTINEL_LOW,
      up = SENTINEL_HIGH;
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
    if (text) showToast(text, kind);
    else showToast("");
  }

  // For daily, `param` is the date key; for random, it's the seed (generated if absent).
  function startGame(mode, param) {
    if (endDialog.open) endDialog.close();
    state.mode = mode;
    state.guesses = [];
    state.currentLower = SENTINEL_LOW;
    state.currentUpper = SENTINEL_HIGH;
    state.done = false;
    state.won = false;
    state.tipsRevealed = [];
    state.lastGuessAt = Date.now();
    state.tipStartRange = distanceBetween(state.currentLower, state.currentUpper);

    if (mode === "daily") {
      const today = todayKey();
      state.dateKey = param || today;
      state.seed = null;
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
          ? saved.tipsRevealed.map((t) => (typeof t === "string" ? { id: t, afterGuess: 0 } : t))
          : [];
        recomputeBounds();
        state.tipStartRange =
          typeof saved.tipStartRange === "number"
            ? saved.tipStartRange
            : distanceBetween(state.currentLower, state.currentUpper);
      }
    } else {
      state.dateKey = null;
      state.seed = param || makeSeed();
      state.isHistorical = false;
      state.target = pickTarget("random:" + state.seed);
      puzzleLabel.textContent = "Modo aleatório";
      puzzleDate.textContent = `código: ${state.seed}`;
    }
    puzzleDate.title = "Copiar link do jogo";

    setMessage("");
    input.value = "";
    input.disabled = state.done;
    renderHints();
    updateHintButton();
    render();
    onRoute && onRoute(descriptor());
    if (state.done) showEndDialog();
  }

  function tipText(id) {
    if (id === "last") return `Dica: a palavra termina com "${state.target[4]}".`;
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
    hintBtn.style.setProperty("--tip-progress", "0");
    hintBtn.style.setProperty("--tip-ring-color", "var(--muted)");
    if (state.done) {
      hintBtn.setAttribute("aria-disabled", "true");
      hintBtn.classList.remove("ready");
      hintBtn.title = "Dica";
      return;
    }
    const next = HINT_TIPS[state.tipsRevealed.length];
    if (!next) {
      hintBtn.setAttribute("aria-disabled", "true");
      hintBtn.classList.remove("ready");
      hintBtn.title = "Sem mais dicas";
      return;
    }
    const range = distanceBetween(state.currentLower, state.currentUpper);
    const { rangeOk, rangeProgress, idleProgress, ready, remainSec } = computeHintState({
      range,
      start: state.tipStartRange ?? range,
      rangeMax: next.rangeMax,
      idleMs: next.idleMs,
      lastGuessAt: state.lastGuessAt,
    });
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
    const reasons = [];
    if (!rangeOk) reasons.push(`alcance ${range} (precisa ≤${next.rangeMax})`);
    if (idleProgress < 1) reasons.push(`aguarde ${remainSec}s`);
    hintBtn.title = ready ? "Dica disponível" : `Próxima dica: ${reasons.join(" · ")}`;
  }

  function loadDaily(dateKey) {
    return readJSON(STORAGE_PREFIX + dateKey);
  }
  function saveDaily() {
    if (state.mode !== "daily") return;
    const payload = {
      dateKey: state.dateKey,
      target: state.target,
      guesses: state.guesses,
      done: state.done,
      won: state.won,
      tipsRevealed: state.tipsRevealed,
      tipStartRange: state.tipStartRange,
    };
    writeJSON(STORAGE_PREFIX + state.dateKey, payload);
  }

  function submitGuess(raw) {
    if (state.done) return;
    const word = normalize(raw);
    const fail = (text) => {
      setMessage(text, "error");
      input.focus({ preventScroll: true });
    };
    if (!/^[a-z]{5}$/.test(word)) {
      fail("Use 5 letras (a–z).");
      return;
    }
    if (!VALID.has(word)) {
      fail(`"${word}" não está no dicionário.`);
      return;
    }
    if (state.guesses.some((g) => g.word === word)) {
      fail("Você já tentou essa palavra.");
      return;
    }
    if (word !== state.target && !(word > state.currentLower && word < state.currentUpper)) {
      fail(`"${word}" está fora dos limites atuais.`);
      return;
    }

    let side;
    if (word === state.target) {
      side = "hit";
      state.done = true;
      state.won = true;
    } else if (word > state.target) side = "upper";
    else side = "lower";
    state.guesses.push({ word, side });
    state.lastGuessAt = Date.now();
    recomputeBounds();

    if (!state.won && state.guesses.length >= MAX_GUESSES) {
      state.done = true;
      state.won = false;
    }

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
    let lo = SENTINEL_LOW,
      hi = SENTINEL_HIGH;
    const fmt = (x) => x.toLocaleString("pt-BR");
    const tipLine = (id) => {
      if (!includeWords) return "💡 Dica usada";
      if (id === "last") return `💡 Dica: última letra "${state.target[4]}"`;
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
      const arrow = g.side === "hit" ? "✅" : g.side === "lower" ? "🔼" : "🔽";
      const word = includeWords ? ` ${g.word}` : "";
      if (g.side === "hit") {
        lines.push(`${arrow}${word}  Sucesso em ${n} tentativa${n === 1 ? "" : "s"}`);
      } else if (includeWords) {
        lines.push(`${arrow} ${lo} (${fmt(lowerDist)}) — (${fmt(upperDist)}) ${hi}`);
      } else {
        lines.push(`${arrow}${word}  ${fmt(lowerDist)} - ${fmt(upperDist)}`);
      }
      emitTipsAfter(i + 1);
    }
    if (!state.won) lines.push(`❌ Não consegui em ${MAX_GUESSES} tentativas`);
    return lines;
  }

  function modeLabel() {
    return state.mode === "daily"
      ? `Palavra do dia (${formatDate(state.dateKey)})`
      : "Modo aleatório";
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
    const header =
      state.mode === "daily"
        ? `Entrelinhas ${formatDate(state.dateKey)}`
        : "Entrelinhas (aleatório)";
    const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    // The link reopens this exact puzzle (same date, or same random seed).
    const footer = `Jogue este: ${buildShareUrl(descriptor())}`;
    return `${header} ${score}\n${buildSummaryLines({ includeWords: false }).join("\n")}\n\n${footer}`;
  }

  async function share() {
    const result = await shareOrCopy(buildShareText());
    if (result === "copied") setMessage("Resultado copiado!", "success");
    else if (result === "failed") setMessage("Não foi possível copiar o resultado", "error");
  }

  // Copy/share a link to the current puzzle (used by the date/seed chip).
  async function shareLink() {
    const result = await shareOrCopy(buildShareUrl(descriptor()));
    if (result === "copied") setMessage("Link copiado!", "success");
    else if (result === "failed") setMessage("Não foi possível copiar o link", "error");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitGuess(input.value);
  });
  const guessBtn = $("guess-btn");
  guessBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!input.disabled) form.requestSubmit();
  });
  input.addEventListener("input", () => {
    const cleaned = normalize(input.value).slice(0, 5);
    if (cleaned !== input.value) input.value = cleaned;
    renderAlphabet();
  });
  hintBtn.addEventListener("click", () => {
    if (state.done) return;
    const next = HINT_TIPS[state.tipsRevealed.length];
    if (!next) {
      showToast("Sem mais dicas disponíveis", "warn");
      return;
    }
    const range = distanceBetween(state.currentLower, state.currentUpper);
    const idle = Date.now() - state.lastGuessAt;
    if (range > next.rangeMax) {
      const need = range - next.rangeMax;
      showToast(
        `Reduza o intervalo em mais ${need} palavra${need === 1 ? "" : "s"} para liberar a dica`,
        "warn",
      );
      return;
    }
    if (idle < next.idleMs) {
      const remainSec = Math.max(1, Math.ceil((next.idleMs - idle) / 1000));
      showToast(`Aguarde ${remainSec}s para liberar a dica`, "warn");
      return;
    }
    state.tipsRevealed.push({ id: next.id, afterGuess: state.guesses.length });
    state.tipStartRange = distanceBetween(state.currentLower, state.currentUpper);
    renderHints();
    updateHintButton();
    saveDaily();
  });
  const classicView = $("classic-view");
  setInterval(() => {
    if (!document.hidden && classicView && !classicView.hidden) updateHintButton();
  }, 500);
  helpBtn.addEventListener("click", () => {
    if (typeof helpDialog.showModal === "function") helpDialog.showModal();
  });
  shareBtn.addEventListener("click", share);
  puzzleDate.classList.add("link-chip");
  puzzleDate.addEventListener("click", shareLink);
  playAgainBtn.addEventListener("click", () => {
    endDialog.close();
    startGame("random");
  });
  endMenuBtn.addEventListener("click", () => {
    endDialog.close();
    onBack && onBack();
  });

  function maybeRolloverDaily() {
    if (
      state.mode === "daily" &&
      !state.isHistorical &&
      state.dateKey &&
      state.dateKey !== todayKey()
    )
      startGame("daily");
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) maybeRolloverDaily();
  });
  window.addEventListener("focus", maybeRolloverDaily);

  return {
    start(mode, param) {
      startGame(mode, param);
      input.focus({ preventScroll: true });
    },
    focus() {
      input.focus({ preventScroll: true });
    },
    shouldConfirmExit() {
      return state.mode === "random" && !state.done && state.guesses.length > 0;
    },
  };
}
