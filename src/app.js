import { initClassic, CLASSIC_STORAGE_PREFIX, DAILY_EPOCH } from "./game.js";
import { initCrossword, CROSSWORD_STORAGE_PREFIX } from "./crossword.js";
import { todayKey, listDateKeys } from "./daily.js";
import { readJSON } from "./storage.js";
import { parseHash, buildHash, extractSeed } from "./routes.js";

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

const views = {
  menu: document.getElementById("menu-view"),
  classic: document.getElementById("classic-view"),
  crossword: document.getElementById("crossword-view"),
};

function showView(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
}

// Reflect the active game in the URL hash so it can be copied/shared and
// reopened to the exact same puzzle. Called by each game via onRoute.
function setRoute(descriptor) {
  try {
    const url = descriptor ? "#" + buildHash(descriptor) : location.pathname + location.search;
    history.replaceState({}, "", url);
  } catch {}
}

function goMenu() {
  showView("menu");
  setRoute(null);
}

const classic = initClassic({ onBack: goMenu, onRoute: setRoute });
const crossword = initCrossword({ onBack: goMenu, onRoute: setRoute });

function startGame(mode, variant, param) {
  showView(mode);
  (mode === "crossword" ? crossword : classic).start(variant, param);
}

// Menu buttons (the main half of each split button)
document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const [mode, variant] = btn.getAttribute("data-mode").split("-");
    startGame(mode, variant);
  });
});

// Back buttons inside each game view
function activeGame() {
  if (!views.classic.hidden) return classic;
  if (!views.crossword.hidden) return crossword;
  return null;
}
document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const game = activeGame();
    if (game && game.shouldConfirmExit && game.shouldConfirmExit()) {
      if (!confirm("Você tem certeza? O progresso desta partida aleatória será perdido.")) return;
    }
    goMenu();
  });
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
    mode === "crossword" ? "Cruzadas — dias anteriores" : "Clássico — dias anteriores";
  pastGrid.innerHTML = "";
  const today = todayKey();
  const keys = listDateKeys(DAILY_EPOCH, today);
  const prefix = mode === "crossword" ? CROSSWORD_STORAGE_PREFIX : CLASSIC_STORAGE_PREFIX;
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

// Initial view: respect the hash deep-link, else show the menu.
const route = parseHash(location.hash);
if (route) startGame(route.mode, route.variant, route.param || undefined);
else showView("menu");

// Register the service worker for offline play (no-op when unsupported).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
