import { ANSWERS } from "./data/answers.js";
import { VALID } from "./data/valid.js";
import {
  SENTINEL_LOW,
  SENTINEL_HIGH,
  normalize,
  distanceBetween,
  pluralWords,
  prefixFitsGaps,
} from "./dictionary.js";
import { formatDate, seededRng } from "./daily.js";
import { migrateLegacyDaily } from "./storage.js";
import { createGameController } from "./game-shell.js";

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

// Restore a persisted tip entry; legacy saves stored bare string ids.
function normalizeTip(t) {
  return typeof t === "string" ? { id: t, afterGuess: 0 } : t;
}

export function initClassic(callbacks = {}) {
  const lowerRow = $("lower-row");
  const targetRow = $("target-row");
  const upperRow = $("upper-row");
  const alphaHint = $("alpha-hint");
  const input = $("guess-input");
  const guessesLeft = $("guesses-left");
  const hintsEl = $("hints");

  function recomputeBounds(state) {
    let lo = SENTINEL_LOW,
      up = SENTINEL_HIGH;
    for (const g of state.guesses) {
      if (g.side === "lower" && g.word > lo) lo = g.word;
      else if (g.side === "upper" && g.word < up) up = g.word;
    }
    state.currentLower = lo;
    state.currentUpper = up;
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

  function renderAlphabet(state) {
    const prefix = normalize(input.value);
    alphaHint.innerHTML = "";
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(97 + i);
      const span = document.createElement("span");
      const ok = prefixFitsGaps(prefix, c, [[state.currentLower, state.currentUpper]]);
      span.className = "letter " + (ok ? "enabled" : "disabled");
      span.textContent = c;
      alphaHint.appendChild(span);
    }
  }

  function tipText(state, id) {
    if (id === "last") return `Dica: a palavra termina com "${state.target[4]}".`;
    if (id === "secondLast") return `Dica: a penúltima letra é "${state.target[3]}".`;
    return "Dica.";
  }
  function renderHints(state) {
    hintsEl.innerHTML = "";
    for (const t of state.tipsRevealed) {
      const div = document.createElement("div");
      div.className = "hint-banner";
      div.textContent = tipText(state, t.id);
      hintsEl.appendChild(div);
    }
  }

  function renderBoard(state, justAddedWord = null) {
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
    renderHints(state);
    renderAlphabet(state);
  }

  function modeLabel(state) {
    return state.mode === "daily"
      ? `Palavra do dia (${formatDate(state.dateKey)})`
      : "Modo aleatório";
  }

  function buildSummaryLines(state, { includeWords } = { includeWords: true }) {
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
      // A side that hasn't been narrowed yet is still the sentinel; show it as
      // unknown ("?????" / "?") to match the in-game board, instead of leaking
      // the AAAAA / ZZZZZ limits.
      const loWord = lo === SENTINEL_LOW ? "?????" : lo;
      const hiWord = hi === SENTINEL_HIGH ? "?????" : hi;
      const loDist = lo === SENTINEL_LOW ? "?" : fmt(distanceBetween(lo, state.target));
      const hiDist = hi === SENTINEL_HIGH ? "?" : fmt(distanceBetween(state.target, hi));
      const arrow = g.side === "hit" ? "✅" : g.side === "lower" ? "🔼" : "🔽";
      const word = includeWords ? ` ${g.word}` : "";
      if (g.side === "hit") {
        lines.push(`${arrow}${word}  Sucesso em ${n} tentativa${n === 1 ? "" : "s"}`);
      } else if (includeWords) {
        lines.push(`${arrow} ${loWord} (${loDist}) - (${hiDist}) ${hiWord}`);
      } else {
        lines.push(`${arrow}${word}  ${loDist} - ${hiDist}`);
      }
      emitTipsAfter(i + 1);
    }
    if (!state.won) lines.push(`❌ Não consegui em ${MAX_GUESSES} tentativas`);
    return lines;
  }

  return createGameController({
    mode: "classic",
    maxGuesses: MAX_GUESSES,
    storagePrefix: STORAGE_PREFIX,
    hintTips: HINT_TIPS,
    dailyTitle: "Palavra do dia",
    hintRangeWord: "alcance",
    exitModeNoun: "no Clássico",
    copyErrors: {
      result: "Não foi possível copiar o resultado",
      link: "Não foi possível copiar o link",
    },
    callbacks,
    els: {
      input,
      form: $("guess-form"),
      guessBtn: $("guess-btn"),
      hintBtn: $("hint-btn"),
      backBtn: $("back-btn"),
      guessesTotal: $("guesses-total"),
      puzzleLabel: $("puzzle-label"),
      puzzleDate: $("puzzle-date"),
      endDialog: $("end-dialog"),
      endTitle: $("end-title"),
      endBody: $("end-body"),
      shareBtn: $("share-btn"),
      playAgainBtn: $("play-again-btn"),
      endMenuBtn: $("end-menu-btn"),
      crossModeBtn: $("cross-mode-btn"),
      view: $("classic-view"),
    },

    initState(state) {
      state.target = null;
      state.currentLower = SENTINEL_LOW;
      state.currentUpper = SENTINEL_HIGH;
    },
    resetState(state) {
      state.currentLower = SENTINEL_LOW;
      state.currentUpper = SENTINEL_HIGH;
    },
    createPuzzle(state) {
      const seed = state.mode === "daily" ? state.dateKey : "random:" + state.seed;
      state.target = pickTarget(seed);
    },
    restoreDaily(state, saved) {
      state.target = pickTarget(state.dateKey);
      if (!(saved && saved.dateKey === state.dateKey && saved.target === state.target))
        return false;
      state.guesses = saved.guesses || [];
      state.done = !!saved.done;
      state.won = !!saved.won;
      state.tipsRevealed = Array.isArray(saved.tipsRevealed)
        ? saved.tipsRevealed.map(normalizeTip)
        : [];
      recomputeBounds(state);
      if (typeof saved.tipStartRange === "number") state.tipStartRange = saved.tipStartRange;
      return true;
    },
    serialize(state) {
      return { target: state.target };
    },
    currentRange(state) {
      return distanceBetween(state.currentLower, state.currentUpper);
    },

    applyGuess(word, state) {
      if (!VALID.has(word)) return { error: `"${word}" não está no dicionário.` };
      if (state.guesses.some((g) => g.word === word))
        return { error: "Você já tentou essa palavra." };
      if (word !== state.target && !(word > state.currentLower && word < state.currentUpper))
        return { error: `"${word}" está fora dos limites atuais.` };

      let side;
      if (word === state.target) {
        side = "hit";
        state.done = true;
        state.won = true;
      } else if (word > state.target) side = "upper";
      else side = "lower";
      state.guesses.push({ word, side });
      state.lastGuessAt = Date.now();
      recomputeBounds(state);
      if (!state.won && state.guesses.length >= MAX_GUESSES) {
        state.done = true;
        state.won = false;
      }
      return { message: "", messageKind: "" };
    },

    renderBoard,
    renderAlphabet,

    revealHint(state, api) {
      const next = HINT_TIPS[state.tipsRevealed.length];
      state.tipsRevealed.push({ id: next.id, afterGuess: state.guesses.length });
      state.tipStartRange = api.currentRange();
      renderHints(state);
      api.updateHintButton();
      api.save();
    },
    hintRangeToast(range, next) {
      const need = range - next.rangeMax;
      return `Reduza o intervalo em mais ${need} palavra${need === 1 ? "" : "s"} para liberar a dica`;
    },

    endTitle(state) {
      return state.won ? "Você acertou! 🎉" : "Fim de jogo";
    },
    endInfo(state) {
      return `${modeLabel(state)} · a palavra era "${state.target}".`;
    },
    buildSummary(state) {
      return buildSummaryLines(state);
    },
    buildShareText(state, shareUrl) {
      const header =
        state.mode === "daily"
          ? `Entrelinhas ${formatDate(state.dateKey)}`
          : "Entrelinhas (aleatório)";
      const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
      // The link reopens this exact puzzle (same date, or same random seed).
      const body = buildSummaryLines(state, { includeWords: false }).join("\n");
      return `${header} ${score}\n${body}\n\nJogue este: ${shareUrl}`;
    },

    wire() {
      // Tapping the secret "?????" row focuses the guess input (and, on mobile,
      // pops the keyboard, since this runs inside a user gesture).
      targetRow.addEventListener("click", () => {
        if (!input.disabled) input.focus({ preventScroll: true });
      });
    },
  });
}
