// Shared game shell for both modes (classic and crossword).
//
// The two modes share almost their entire lifecycle: daily/random setup and
// restore, guess submission, the hint button + progress ring + timing, the end
// dialog, sharing, daily rollover, and all the input wiring. That generic
// machinery lives here, parameterized by a per-mode `spec`. Each mode supplies
// only what differs (puzzle generation, board rendering, guess rules, summary
// text) as small hooks. Adding a new mode means writing a new spec, not copying
// this file.
//
// A spec provides:
//   mode            "classic" | "crossword" (used in routes/links)
//   maxGuesses      number shown as the denominator and the loss threshold
//   storagePrefix   localStorage key prefix for daily saves
//   hintTips        [{ rangeMax, idleMs, ... }] gating each successive hint
//   els             shared DOM refs the shell drives (see below)
//   dailyTitle      label for the daily puzzle ("Palavra do dia", ...)
//   hintRangeWord   noun for the range in the hint tooltip ("alcance" | "distância")
//   exitModeNoun    mode phrase in the leave dialog ("no Clássico" | "nas Cruzadas")
//   copyErrors      { result, link } toast text when a copy fails
//   callbacks       { onBack, onRoute, crossPromo } from app.js
// Hooks (each receives game state, plus `api` where it needs shell operations):
//   initState(state)             add the mode's own fields to the state object
//   resetState(state)            clear those fields at the start of a new game
//   createPuzzle(state)          build a fresh puzzle from state.dateKey/seed
//   restoreDaily(state, saved)   restore from a save; return true on success
//   serialize(state)             mode-specific fields to persist
//   applyGuess(word, state)      validate + apply a guess; return { error } or
//                                { message, messageKind } (mutates state)
//   currentRange(state)          distance-to-answer that gates hints
//   renderBoard(state, justAdded) render the board, list, counters, alphabet
//   renderAlphabet(state)        refresh just the alphabet hint (on each keystroke)
//   revealHint(state, api)       act on a ready hint (reveal now, or start selecting)
//   hintRangeToast(range, next)  toast when the range still gates the next hint
//   isSelecting(state)           optional: true while picking a hint target
//   onHintClickStart(state, api) optional: intercept a hint click (return true to stop)
//   endTitle(state) / endInfo(state) / buildSummary(state)  end-dialog content
//   buildShareText(state, shareUrl)  the shareable result text
//   wire(api)                    attach any mode-specific event listeners

import { showToast } from "./toast.js";
import { shareOrCopy } from "./share-helpers.js";
import { normalize } from "./dictionary.js";
import { todayKey, formatDate, makeSeed } from "./daily.js";
import { readJSON, writeJSON } from "./storage.js";
import { computeHintState } from "./hint.js";
import { buildShareUrl } from "./routes.js";

// On-screen keyboard layout (QWERTY). The last row is framed by the two action
// keys: Enter (submit) and Backspace (delete).
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export function createGameController(spec) {
  const {
    mode,
    maxGuesses,
    storagePrefix,
    hintTips,
    els,
    dailyTitle,
    hintRangeWord,
    exitModeNoun,
    copyErrors,
    callbacks: { onBack, onRoute, crossPromo, onGameEnd },
  } = spec;

  els.guessesTotal.textContent = maxGuesses;

  // The "play the other mode's daily" action shown on the end screen, when
  // offered. Refreshed each time the end dialog opens.
  let currentPromo = null;

  const state = {
    mode: "daily",
    dateKey: null,
    seed: null,
    isHistorical: false,
    guesses: [],
    done: false,
    won: false,
    tipsRevealed: [],
    lastGuessAt: Date.now(),
    tipStartRange: null,
    draft: "", // the in-progress guess; rendered into the secret slot, not persisted
  };
  spec.initState(state);

  // Identifies the current game for routing and shareable links.
  function descriptor() {
    return state.mode === "daily"
      ? { mode, variant: "daily", param: state.dateKey }
      : { mode, variant: "random", param: state.seed };
  }

  function setMessage(text, kind = "") {
    showToast(text || "", kind);
  }
  // The on-screen keyboard is always visible and a document-level keydown
  // listener captures hardware keys, so there is no text field to focus. Kept as
  // a no-op since several call sites (and the returned `focus()`) still call it.
  function focusInput() {}
  function currentRange() {
    return spec.currentRange(state);
  }
  // The on-screen Enter key, captured when the keyboard is built. Submitting only
  // makes sense with a full 5-letter guess, so it stays disabled until then.
  let enterKey = null;
  function updateEnterKey() {
    if (enterKey) enterKey.disabled = state.done || state.draft.length !== 5;
  }
  function renderBoard(justAdded) {
    spec.renderBoard(state, justAdded);
    updateEnterKey();
  }

  // Operations the mode hooks may need from the shell.
  const api = {
    state,
    els,
    setMessage,
    save: saveDaily,
    render: () => renderBoard(),
    renderBoard,
    updateHintButton,
    currentRange,
    focusInput,
    descriptor,
  };

  // --- Persistence ---
  function saveDaily() {
    if (state.mode !== "daily") return;
    const payload = {
      dateKey: state.dateKey,
      guesses: state.guesses,
      done: state.done,
      won: state.won,
      tipsRevealed: state.tipsRevealed,
      tipStartRange: state.tipStartRange,
      ...spec.serialize(state),
    };
    writeJSON(storagePrefix + state.dateKey, payload);
  }

  // True while a game is in progress: started (a guess or a revealed tip) but
  // not finished. Both the topbar hint/back swap and the leave-confirmation
  // prompt key off this, so leaving in any other state loses nothing.
  function isInProgress() {
    return (state.guesses.length > 0 || state.tipsRevealed.length > 0) && !state.done;
  }

  // --- Hint button ---
  function updateHintButton() {
    const hintBtn = els.hintBtn;
    // With nothing to lose (not started, or finished), swap the hint button for
    // a back-to-menu arrow: leaving then needs no confirmation.
    const safeToLeave = !isInProgress();
    if (els.backBtn) els.backBtn.hidden = !safeToLeave;
    hintBtn.hidden = safeToLeave;
    hintBtn.style.setProperty("--tip-progress", "0");
    hintBtn.style.setProperty("--tip-ring-color", "var(--muted)");
    if (state.done) {
      hintBtn.setAttribute("aria-disabled", "true");
      hintBtn.classList.remove("ready");
      hintBtn.title = "Dica";
      return;
    }
    if (spec.isSelecting && spec.isSelecting(state)) {
      hintBtn.setAttribute("aria-disabled", "false");
      hintBtn.classList.remove("ready");
      hintBtn.title = "Toque em uma letra para revelar (Esc para cancelar)";
      return;
    }
    const next = hintTips[state.tipsRevealed.length];
    if (!next) {
      hintBtn.setAttribute("aria-disabled", "true");
      hintBtn.classList.remove("ready");
      hintBtn.title = "Sem mais dicas";
      return;
    }
    const range = currentRange();
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
    if (!rangeOk) reasons.push(`${hintRangeWord} ${range} (precisa ≤${next.rangeMax})`);
    if (idleProgress < 1) reasons.push(`aguarde ${remainSec}s`);
    hintBtn.title = ready ? "Dica disponível" : `Próxima dica: ${reasons.join(" · ")}`;
  }

  // --- Input controller (on-screen keyboard + hardware keys) ---
  // The current guess lives in state.draft and is rendered into the secret slot
  // by the mode (classic target squares / crossword draft row).
  let overflowAttempts = 0;
  function setDraft(next) {
    state.draft = normalize(next).slice(0, 5);
    renderBoard();
    spec.renderAlphabet(state);
  }
  function addLetter(ch) {
    if (state.done) return;
    if (state.draft.length >= 5) {
      // Extra keystrokes beyond five are dropped silently; nudge after a few so
      // it isn't a mystery why typing "stopped working".
      if (++overflowAttempts >= 3) {
        setMessage("Use 5 letras (a-z) em sua tentativa.", "error");
        overflowAttempts = 0;
      }
      return;
    }
    overflowAttempts = 0;
    setDraft(state.draft + ch);
  }
  function backspace() {
    if (state.done) return;
    overflowAttempts = 0;
    if (state.draft) setDraft(state.draft.slice(0, -1));
  }
  function submitDraft() {
    overflowAttempts = 0;
    submitGuess(state.draft);
  }
  function setKeyboardDisabled(disabled) {
    if (els.keyboard) els.keyboard.classList.toggle("kb-disabled", disabled);
  }

  function buildKeyboard() {
    const kb = els.keyboard;
    if (!kb) return;
    kb.innerHTML = "";
    const makeKey = (label, { value, action, wide } = {}) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "key" + (wide ? " key-wide" : "");
      btn.textContent = label;
      if (action) btn.setAttribute("aria-label", action === "enter" ? "Enviar" : "Apagar");
      // Fire on press (pointerdown), not release (click): on mobile, click events
      // are serialized/suppressed while another finger is still down, so fast
      // multi-tap typing stalled until the previous key lifted. pointerdown fires
      // per touch point immediately. The synthetic click that follows has no
      // listener, so it's harmless.
      btn.addEventListener("pointerdown", () => {
        if (action === "enter") submitDraft();
        else if (action === "backspace") backspace();
        else addLetter(value);
      });
      return btn;
    };
    KEYBOARD_ROWS.forEach((row, i) => {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      if (i === KEYBOARD_ROWS.length - 1) {
        enterKey = makeKey("⏎", { action: "enter", wide: true });
        rowEl.appendChild(enterKey);
      }
      for (const ch of row) rowEl.appendChild(makeKey(ch, { value: ch }));
      if (i === KEYBOARD_ROWS.length - 1)
        rowEl.appendChild(makeKey("⌫", { action: "backspace", wide: true }));
      kb.appendChild(rowEl);
    });
    updateEnterKey();
  }

  // --- Game flow ---
  function submitGuess(raw) {
    if (state.done) return;
    const word = normalize(raw);
    const fail = (text) => {
      setMessage(text, "error");
      focusInput();
    };
    if (!/^[a-z]{5}$/.test(word)) {
      fail("Use 5 letras (a-z) em sua tentativa.");
      return;
    }
    const result = spec.applyGuess(word, state);
    if (result.error) {
      fail(result.error);
      return;
    }

    state.draft = "";
    setMessage(result.message || "", result.messageKind || "");
    saveDaily();
    renderBoard(word);
    updateHintButton();

    if (state.done) {
      setKeyboardDisabled(true);
      // Fire once, on the live transition to finished (not on restore), so the
      // caller can record stats for games that aren't saved per-day (random).
      onGameEnd &&
        onGameEnd({
          variant: state.mode,
          won: state.won,
          words: state.guesses.map((g) => g.word),
        });
      setTimeout(showEndDialog, 350);
    } else {
      focusInput();
    }
  }

  // For daily, `param` is the date key; for random, it's the seed (generated if absent).
  function startGame(modeArg, param) {
    if (els.endDialog.open) els.endDialog.close();
    state.mode = modeArg;
    state.guesses = [];
    state.done = false;
    state.won = false;
    state.tipsRevealed = [];
    state.lastGuessAt = Date.now();
    state.tipStartRange = null;
    state.draft = "";
    spec.resetState(state);

    let restored = false;
    if (modeArg === "daily") {
      const today = todayKey();
      state.dateKey = param || today;
      state.seed = null;
      state.isHistorical = state.dateKey !== today;
      restored = spec.restoreDaily(state, readJSON(storagePrefix + state.dateKey)) === true;
      els.puzzleLabel.textContent = dailyTitle;
      els.puzzleDate.textContent = formatDate(state.dateKey);
    } else {
      state.dateKey = null;
      state.seed = param || makeSeed();
      state.isHistorical = false;
      els.puzzleLabel.textContent = "Modo aleatório";
      els.puzzleDate.textContent = `código: ${state.seed}`;
    }
    els.puzzleDate.title = "Copiar link do jogo";

    if (!restored) spec.createPuzzle(state);
    if (state.tipStartRange == null) state.tipStartRange = currentRange();

    setMessage("");
    state.draft = "";
    setKeyboardDisabled(state.done);
    renderBoard();
    updateHintButton();
    onRoute && onRoute(descriptor());
    if (state.done) showEndDialog();
  }

  // --- End dialog & sharing ---
  function showEndDialog() {
    els.endTitle.textContent = spec.endTitle(state);
    els.endBody.innerHTML = "";
    const info = document.createElement("p");
    info.textContent = spec.endInfo(state);
    info.style.margin = "0 0 10px";
    els.endBody.appendChild(info);
    const pre = document.createElement("pre");
    pre.className = "summary";
    pre.textContent = spec.buildSummary(state).join("\n");
    els.endBody.appendChild(pre);
    currentPromo = crossPromo ? crossPromo(state.mode, state.dateKey) : null;
    if (currentPromo) {
      els.crossModeBtn.textContent = currentPromo.label;
      els.crossModeBtn.hidden = false;
    } else {
      els.crossModeBtn.hidden = true;
    }
    if (typeof els.endDialog.showModal === "function") els.endDialog.showModal();
  }

  async function share() {
    const result = await shareOrCopy(spec.buildShareText(state, buildShareUrl(descriptor())));
    if (result === "copied") setMessage("Resultado copiado!", "success");
    else if (result === "failed") setMessage(copyErrors.result, "error");
  }
  // Copy/share a link to the current puzzle (used by the date/seed chip).
  async function shareLink() {
    const result = await shareOrCopy(buildShareUrl(descriptor()));
    if (result === "copied") setMessage("Link copiado!", "success");
    else if (result === "failed") setMessage(copyErrors.link, "error");
  }

  // --- Generic wiring (shared by every mode) ---
  buildKeyboard();
  // Hardware keyboard support: a single document-level listener so desktop
  // players can type without any focused text field (which would pop the OS
  // keyboard on mobile). Ignored while another view, a dialog, or an editable
  // field is active, or once the game is over.
  document.addEventListener("keydown", (e) => {
    if (els.view.hidden || state.done) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submitDraft();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      backspace();
    } else if (/^[a-zà-ÿ]$/i.test(e.key)) {
      e.preventDefault();
      addLetter(normalize(e.key));
    }
  });
  els.hintBtn.addEventListener("click", () => {
    if (state.done) return;
    if (spec.onHintClickStart && spec.onHintClickStart(state, api)) return;
    const next = hintTips[state.tipsRevealed.length];
    if (!next) {
      showToast("Sem mais dicas disponíveis", "warn");
      return;
    }
    const range = currentRange();
    const idle = Date.now() - state.lastGuessAt;
    if (range > next.rangeMax) {
      showToast(spec.hintRangeToast(range, next), "warn");
      return;
    }
    if (idle < next.idleMs) {
      const remainSec = Math.max(1, Math.ceil((next.idleMs - idle) / 1000));
      showToast(`Aguarde ${remainSec}s para liberar a dica`, "warn");
      return;
    }
    spec.revealHint(state, api);
  });
  setInterval(() => {
    if (!document.hidden && els.view && !els.view.hidden) updateHintButton();
  }, 500);
  els.shareBtn.addEventListener("click", share);
  els.puzzleDate.classList.add("link-chip");
  els.puzzleDate.addEventListener("click", shareLink);
  els.playAgainBtn.addEventListener("click", () => {
    els.endDialog.close();
    startGame("random");
  });
  els.endMenuBtn.addEventListener("click", () => {
    els.endDialog.close();
    onBack && onBack();
  });
  els.crossModeBtn.addEventListener("click", () => {
    const promo = currentPromo;
    els.endDialog.close();
    promo && promo.play();
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

  if (spec.wire) spec.wire(api);

  return {
    start(modeArg, param) {
      startGame(modeArg, param);
      focusInput();
    },
    focus() {
      focusInput();
    },
    // Details for the leave-confirmation dialog when a game is in progress;
    // null when leaving needs no confirmation.
    exitInfo() {
      if (!isInProgress()) return null;
      if (state.mode === "random") {
        return {
          message:
            "O progresso desta partida aleatória será perdido. Para jogar este mesmo jogo de novo, copie o link (ou anote o código):",
          code: state.seed,
          link: buildShareUrl(descriptor()),
        };
      }
      const how =
        state.dateKey === todayKey()
          ? `Seu progresso fica salvo. Para retomar, escolha "Do dia" ${exitModeNoun}.`
          : `Seu progresso fica salvo. Para retomar, use 📅 ${exitModeNoun} e escolha a data ${formatDate(state.dateKey)}.`;
      return { message: how, code: null, link: null };
    },
  };
}
