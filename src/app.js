import { initClassic, CLASSIC_STORAGE_PREFIX, DAILY_EPOCH } from "./game.js";
import { initCrossword, CROSSWORD_STORAGE_PREFIX } from "./crossword.js";
import { todayKey, listDateKeys } from "./daily.js";
import { readJSON } from "./storage.js";

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
  try { history.replaceState({ view: name }, "", `#${name}`); } catch {}
}

const classic = initClassic({ onBack: () => showView("menu") });
const crossword = initCrossword({ onBack: () => showView("menu") });

// Menu buttons
document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.getAttribute("data-mode");
    if (mode === "classic-daily")        { showView("classic");   classic.start("daily"); }
    else if (mode === "classic-random")  { showView("classic");   classic.start("random"); }
    else if (mode === "crossword-daily") { showView("crossword"); crossword.start("daily"); }
    else if (mode === "crossword-random"){ showView("crossword"); crossword.start("random"); }
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
    showView("menu");
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
  pastTitle.textContent = mode === "crossword" ? "Cruzadas — dias anteriores" : "Clássico — dias anteriores";
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
      if (mode === "crossword") { showView("crossword"); crossword.start("daily", key); }
      else { showView("classic"); classic.start("daily", key); }
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

// Initial view: respect hash, else menu
const initial = (location.hash || "").replace("#", "");
if (initial === "classic") { showView("classic"); classic.start("daily"); }
else if (initial === "crossword") { showView("crossword"); crossword.start("daily"); }
else showView("menu");

// Register the service worker for offline play (no-op when unsupported).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
