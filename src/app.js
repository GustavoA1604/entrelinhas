import { initClassic, CLASSIC_STORAGE_PREFIX, DAILY_EPOCH } from "./game.js";
import { initCrossword, CROSSWORD_STORAGE_PREFIX } from "./crossword.js";
import { todayKey, listDateKeys, formatDate } from "./daily.js";
import { readJSON, writeJSON } from "./storage.js";
import { parseHash, buildHash, extractSeed } from "./routes.js";
import { copyToClipboard } from "./share-helpers.js";
import { showToast } from "./toast.js";
import { pickTrivia } from "./trivia.js";
import { initHowTo } from "./howto.js";

// Keep --app-height tracking the visible viewport (above the on-screen keyboard)
// so game views can size to it. dvh alone isn't reliable on iOS Safari.
function updateAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", h + "px");
}
updateAppHeight();
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateAppHeight);
  window.visualViewport.addEventListener("scroll", updateAppHeight);
} else {
  window.addEventListener("resize", updateAppHeight);
}

// Bump alongside package.json (and sw.js CACHE_VERSION) on each release.
const APP_VERSION = "1.1.0";
const versionEl = document.getElementById("app-version");
if (versionEl) versionEl.textContent = "v" + APP_VERSION;

// "Você sabia?" fact for the menu: one on load, plus a refresh button.
const triviaEl = document.getElementById("trivia");
const triviaTextEl = document.getElementById("trivia-text");
const triviaRefreshEl = document.getElementById("trivia-refresh");
if (triviaEl && triviaTextEl) {
  triviaTextEl.textContent = pickTrivia();
  triviaEl.hidden = false;
  if (triviaRefreshEl)
    triviaRefreshEl.addEventListener("click", () => {
      triviaTextEl.textContent = pickTrivia();
    });
}

// Build the inline "Como jogar?" sections (menu + both game views).
initHowTo();

const views = {
  menu: document.getElementById("menu-view"),
  classic: document.getElementById("classic-view"),
  crossword: document.getElementById("crossword-view"),
};

function showView(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
}

// localStorage prefix for a mode's daily entries.
function prefixFor(mode) {
  return mode === "crossword" ? CROSSWORD_STORAGE_PREFIX : CLASSIC_STORAGE_PREFIX;
}

// Which view is showing, and the URL of the active game (so we can restore it
// when intercepting the OS/browser back button).
let view = "menu";
let activeGameUrl = null;
// Set just before we deliberately pop our own history entry, so the popstate
// handler knows the navigation is intentional rather than a user "back".
let leavingIntentionally = false;

// Reflect the active game in the URL hash so it can be copied/shared and
// reopened to the exact same puzzle. Called by each game via onRoute.
function setRoute(descriptor) {
  try {
    const url = descriptor ? "#" + buildHash(descriptor) : location.pathname + location.search;
    activeGameUrl = descriptor ? url : null;
    history.replaceState(history.state, "", url);
  } catch {}
}

function showMenu() {
  view = "menu";
  showView("menu");
  setRoute(null);
}

// On the end screen, offer to play today's *other* mode when its daily is still
// open. Only for today's daily (the "do dia" concept), and only when the other
// mode hasn't been finished yet (unplayed or in-progress).
function makeCrossPromo(currentMode) {
  return (variant, dateKey) => {
    if (variant !== "daily" || dateKey !== todayKey()) return null;
    const otherMode = currentMode === "classic" ? "crossword" : "classic";
    const status = statusFor(prefixFor(otherMode), dateKey);
    if (status === "won" || status === "lost") return null;
    return {
      label: otherMode === "crossword" ? "Jogar Cruzadas do dia" : "Jogar Modo Clássico do dia",
      play: () => startGame(otherMode, "daily", dateKey),
    };
  };
}

const classic = initClassic({
  onBack: leaveToMenu,
  onRoute: setRoute,
  crossPromo: makeCrossPromo("classic"),
});
const crossword = initCrossword({
  onBack: leaveToMenu,
  onRoute: setRoute,
  crossPromo: makeCrossPromo("crossword"),
});

function activeGame() {
  if (!views.classic.hidden) return classic;
  if (!views.crossword.hidden) return crossword;
  return null;
}

// Open a game from the menu (menu buttons, dialogs, or a deep link). Pushes a
// dedicated history entry so the OS/browser back button returns to the menu
// (and we can intercept it to confirm leaving an in-progress game).
function startGame(mode, variant, param) {
  if (view === "menu") history.pushState({ inGame: true }, "", location.href);
  view = mode;
  showView(mode);
  (mode === "crossword" ? crossword : classic).start(variant, param);
}

// Leave the active game for the menu, popping our pushed history entry so the
// back stack stays clean. The popstate handler then shows the menu.
function leaveToMenu() {
  leavingIntentionally = true;
  history.back();
}

// User asked to go back (Menu button or the title/logo). Confirm first if the
// game is in progress, otherwise leave immediately.
function requestBack() {
  const game = activeGame();
  const info = game && game.exitInfo && game.exitInfo();
  if (info) openExitDialog(info);
  else leaveToMenu();
}

// Menu buttons (the main half of each split button)
document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const [mode, variant] = btn.getAttribute("data-mode").split("-");
    startGame(mode, variant);
  });
});

// Back triggers inside each game view (the Menu button and the title/logo).
document.querySelectorAll("[data-back]").forEach((el) => {
  el.addEventListener("click", requestBack);
  // The clickable title (an <h1 role="button">) also needs keyboard activation.
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      requestBack();
    }
  });
});

// === Leave-confirmation dialog ===
const exitDialog = document.getElementById("exit-dialog");
const exitMessage = document.getElementById("exit-message");
const exitCodeRow = document.getElementById("exit-code-row");
const exitCode = document.getElementById("exit-code");
const exitCopyLink = document.getElementById("exit-copy-link");
const exitConfirm = document.getElementById("exit-confirm");
const exitCancel = document.getElementById("exit-cancel");
let pendingExit = null;
let copyResetTimer = null;

function openExitDialog(info) {
  pendingExit = info;
  exitMessage.textContent = info.message;
  if (info.code) {
    exitCode.textContent = info.code;
    exitCodeRow.hidden = false;
  } else {
    exitCodeRow.hidden = true;
  }
  if (typeof exitDialog.showModal === "function") exitDialog.showModal();
  else exitDialog.setAttribute("open", "");
}

// Feedback shown on the button itself: a modal dialog sits in the top layer,
// above the toast, so we can't rely on toasts here.
async function copyWithFeedback(btn, text) {
  if (!text) return;
  const ok = await copyToClipboard(text);
  btn.textContent = ok ? "Copiado!" : "Não foi possível copiar";
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    btn.textContent = btn.dataset.label;
  }, 1600);
}

if (exitCopyLink)
  exitCopyLink.addEventListener("click", () =>
    copyWithFeedback(exitCopyLink, pendingExit && pendingExit.link),
  );
if (exitCode)
  exitCode.addEventListener("click", () =>
    copyWithFeedback(exitCopyLink, pendingExit && pendingExit.link),
  );
if (exitConfirm)
  exitConfirm.addEventListener("click", () => {
    exitDialog.close();
    leaveToMenu();
  });
if (exitCancel) exitCancel.addEventListener("click", () => exitDialog.close());

// Intercept the OS/browser back button.
window.addEventListener("popstate", () => {
  if (leavingIntentionally) {
    leavingIntentionally = false;
    showMenu();
    return;
  }
  if (view === "menu") return; // from the menu, let back leave the app
  const game = activeGame();
  const info = game && game.exitInfo && game.exitInfo();
  if (!info) {
    showMenu();
    return;
  }
  // In-progress game: re-push the entry that was just popped so we stay put,
  // then ask for confirmation.
  history.pushState({ inGame: true }, "", activeGameUrl || location.href);
  openExitDialog(info);
});

// === Past-days dialog ===
function statusFor(prefix, dateKey) {
  const raw = readJSON(prefix + dateKey);
  if (!raw) return "unplayed";
  if (raw.won) return "won";
  if (raw.done) return "lost";
  if ((raw.guesses || []).length > 0) return "in-progress";
  return "unplayed";
}

function openPastDays(mode) {
  const pastDialog = document.getElementById("past-days-dialog");
  const pastTitle = document.getElementById("past-days-title");
  const pastGrid = document.getElementById("past-days-grid");
  if (!pastDialog || !pastTitle || !pastGrid) {
    console.error("past-days dialog elements missing");
    return;
  }
  pastTitle.textContent =
    mode === "crossword" ? "Cruzadas: dias anteriores" : "Clássico: dias anteriores";
  pastGrid.innerHTML = "";
  const today = todayKey();
  const keys = listDateKeys(DAILY_EPOCH, today);
  const prefix = prefixFor(mode);
  for (const key of keys) {
    const [, mm, dd] = key.split("-");
    const status = statusFor(prefix, key);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `past-day-btn status-${status}`;
    btn.dataset.date = key;
    btn.innerHTML = `<span class="past-day-day">${dd}/${mm}</span>`;
    if (key === today) btn.classList.add("is-today");
    btn.title = key + (key === today ? " (hoje)" : "");
    btn.addEventListener("click", () => {
      pastDialog.close();
      startGame(mode, "daily", key);
    });
    pastGrid.appendChild(btn);
  }
  if (typeof pastDialog.showModal === "function") pastDialog.showModal();
  else pastDialog.setAttribute("open", "");
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-past-days]");
  if (!trigger) return;
  e.preventDefault();
  openPastDays(trigger.getAttribute("data-past-days"));
});

// === Seed dialog (play / share a specific random game) ===
const seedDialog = document.getElementById("seed-dialog");
const seedForm = document.getElementById("seed-form");
const seedDialogInput = document.getElementById("seed-dialog-input");
const seedDialogTitle = document.getElementById("seed-dialog-title");
const seedError = document.getElementById("seed-error");
let seedDialogMode = "classic";

function setSeedError(message) {
  if (seedError) {
    seedError.textContent = message || "";
    seedError.hidden = !message;
  }
  if (seedDialogInput) seedDialogInput.classList.toggle("invalid", !!message);
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-seed-input]");
  if (!trigger || !seedDialog) return;
  e.preventDefault();
  seedDialogMode = trigger.getAttribute("data-seed-input");
  if (seedDialogTitle) {
    seedDialogTitle.textContent =
      seedDialogMode === "crossword" ? "Cruzadas com código" : "Clássico com código";
  }
  if (seedDialogInput) seedDialogInput.value = "";
  setSeedError("");
  if (typeof seedDialog.showModal === "function") seedDialog.showModal();
  else seedDialog.setAttribute("open", "");
  if (seedDialogInput) seedDialogInput.focus();
});

if (seedForm) {
  seedForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = seedDialogInput ? seedDialogInput.value : "";
    const seed = extractSeed(raw);
    if (!seed) {
      setSeedError(
        raw.trim()
          ? "Código inválido. Cole só o código (sem espaços) ou um link de jogo."
          : "Digite um código ou cole um link de jogo.",
      );
      if (seedDialogInput) seedDialogInput.focus();
      return;
    }
    seedDialog.close();
    startGame(seedDialogMode, "random", seed);
  });
}
if (seedDialogInput) {
  seedDialogInput.addEventListener("input", () => setSeedError(""));
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-seed-cancel]") && seedDialog) seedDialog.close();
});

// === Settings dialog (theme, and back-to-menu while in a game) ===
// Theme: "system" (follow OS), "light", or "dark". "system" stores nothing and
// drops the data-theme attribute so the prefers-color-scheme media query rules.
// The no-flash <script> in index.html mirrors apply(); keep them in sync.
const THEME_KEY = "entrelinhas:theme";
const THEME_COLORS = { light: "#f7f8fb", dark: "#1f2330" };

function currentTheme() {
  const t = readJSON(THEME_KEY);
  return t === "light" || t === "dark" ? t : "system";
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
    writeJSON(THEME_KEY, theme);
  } else {
    root.removeAttribute("data-theme");
    writeJSON(THEME_KEY, "system");
  }
  const dark = theme === "dark" || (theme === "system" && !prefersLight.matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light;
}

const prefersLight = window.matchMedia("(prefers-color-scheme: light)");
// Keep the theme-color meta accurate when the OS theme flips under "system".
prefersLight.addEventListener("change", () => {
  if (currentTheme() === "system") applyTheme("system");
});

const settingsDialog = document.getElementById("settings-dialog");
const settingsNav = document.getElementById("settings-nav");
const settingsMenuBtn = document.getElementById("settings-menu-btn");

function openSettings() {
  // Sync the radios to the stored value each time it opens.
  const theme = currentTheme();
  for (const input of settingsDialog.querySelectorAll('input[name="theme"]')) {
    input.checked = input.value === theme;
  }
  // The back-to-menu action only makes sense inside a game.
  if (settingsNav) settingsNav.hidden = view === "menu";
  if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
  else settingsDialog.setAttribute("open", "");
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-settings]")) openSettings();
});

if (settingsDialog) {
  settingsDialog.addEventListener("change", (e) => {
    const input = e.target.closest('input[name="theme"]');
    if (input && input.checked) applyTheme(input.value);
  });
}

if (settingsMenuBtn) {
  settingsMenuBtn.addEventListener("click", () => {
    settingsDialog.close();
    requestBack();
  });
}

// Initial view: respect the hash deep-link, else show the menu. Anchor a clean
// menu entry at the base of the history stack first, so back/Menu (even on a
// deep link) lands on the menu instead of leaving the app.
const route = parseHash(location.hash);
history.replaceState({ inGame: false }, "", location.pathname + location.search);
// Daily date keys are "YYYY-MM-DD", so a plain string compare orders them.
// A hand-edited link pointing past today's puzzle stays on the menu with a note.
if (route && route.variant === "daily" && route.param && route.param > todayKey()) {
  showView("menu");
  showToast(`Jogo do dia ${formatDate(route.param)} ainda não disponível.`, "error");
} else if (route) {
  startGame(route.mode, route.variant, route.param || undefined);
} else {
  showView("menu");
}

// Register the service worker for offline play (no-op when unsupported).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
