import { initClassic } from "./game.js";
import { initCrossword } from "./crossword.js";

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
document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => showView("menu"));
});


// Initial view: respect hash, else menu
const initial = (location.hash || "").replace("#", "");
if (initial === "classic") { showView("classic"); classic.start("daily"); }
else if (initial === "crossword") { showView("crossword"); crossword.start("daily"); }
else showView("menu");
