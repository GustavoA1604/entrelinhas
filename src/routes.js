// Deep-link routing via the URL hash, so a shared link reopens the exact game.
//
//   #classic                       → classic daily, today
//   #classic/daily/2026-05-29      → classic daily, that date
//   #classic/random/a1b2c3         → classic random, that seed
//   (same shape for #crossword)
const MODES = new Set(["classic", "crossword"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Parse a hash (with or without the leading "#") into { mode, variant, param }.
// Returns null for the menu / unrecognized routes. `param` is the date (daily),
// the seed (random), or null ("today" daily / seed to be generated).
export function parseHash(hash) {
  const raw = (hash || "").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  const mode = parts[0];
  if (!MODES.has(mode)) return null;
  if (parts.length === 1) return { mode, variant: "daily", param: null };

  const variant = parts[1];
  if (variant === "random") {
    return { mode, variant: "random", param: parts[2] ? decodeURIComponent(parts[2]) : null };
  }
  // Anything else is treated as daily; only accept a well-formed date.
  const date = parts[2];
  return { mode, variant: "daily", param: date && DATE_RE.test(date) ? date : null };
}

// Build the hash fragment (without "#") for a descriptor.
export function buildHash({ mode, variant, param }) {
  if (variant === "random") return param ? `${mode}/random/${encodeURIComponent(param)}` : mode;
  if (variant === "daily" && param) return `${mode}/daily/${param}`;
  return mode;
}

// Absolute, shareable URL for a descriptor. `origin`/`pathname` are injected for
// testability; they default to the current location in the browser.
export function buildShareUrl(descriptor, origin = location.origin, pathname = location.pathname) {
  return `${origin}${pathname}#${buildHash(descriptor)}`;
}

// Pull a random-game seed out of arbitrary pasted text: either a full link
// (…#mode/random/seed) or a bare token. Returns null if nothing usable.
export function extractSeed(text) {
  const t = (text || "").trim();
  if (!t) return null;
  const hashIdx = t.indexOf("#");
  if (hashIdx !== -1) {
    const parsed = parseHash(t.slice(hashIdx));
    if (parsed && parsed.variant === "random" && parsed.param) return parsed.param;
  }
  // Bare token: keep it simple and URL-safe.
  return /\s/.test(t) ? null : t;
}
