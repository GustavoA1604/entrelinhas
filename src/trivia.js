// "Você sabia?" trivia shown in the menu. Three equally-likely buckets:
//   writing: generic PT-BR spelling rules (curated)
//   letters: letter-frequency stats (generated); mostly a small "highlights"
//            pool, but with a small chance of an obscure long-tail fact
//   game:    how Entrelinhas works (curated mechanics + generated corpus sizes)
import { WRITING_RULES, GAME_RULES } from "./data/trivia-curated.js";
import { STATS_HIGHLIGHTS, STATS_LONGTAIL, STATS_GAME } from "./data/trivia-stats.js";

// Odds that a "letters" pick comes from the obscure long tail instead of the
// curated highlights, rare enough to feel like a discovery.
export const LONGTAIL_CHANCE = 0.15;

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// Returns a random trivia string. `rand` is injectable for testing.
export function pickTrivia(rand = Math.random) {
  const bucket = Math.floor(rand() * 3);
  if (bucket === 0) return pick(WRITING_RULES, rand);
  if (bucket === 1) {
    return rand() < LONGTAIL_CHANCE ? pick(STATS_LONGTAIL, rand) : pick(STATS_HIGHLIGHTS, rand);
  }
  return pick([...GAME_RULES, ...STATS_GAME], rand);
}
