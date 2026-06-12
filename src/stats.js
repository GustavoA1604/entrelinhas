// Aggregate statistics. Pure: no DOM, no storage access. The caller gathers the
// inputs (reading localStorage) and passes them in, so this stays testable.
//
// Two sources feed the numbers:
//   - dailyEntries: one { date, saved } per day, newest first (listDateKeys
//     order), where `saved` is the stored daily object or null for an unplayed
//     day. A save looks like { guesses: [{ word, ... }], done, won }. Daily is
//     the only basis for streaks (they're date-based).
//   - randomAgg: a persisted per-mode tally of finished random games, since
//     those aren't saved per-day: { played, won, dist: { [guesses]: count },
//     words: { [word]: count } }. May be undefined.

// Classify a stored daily save into the same buckets the calendar uses.
function statusOf(saved) {
  if (!saved) return "unplayed";
  if (saved.won) return "won";
  if (saved.done) return "lost";
  return (saved.guesses || []).length ? "in-progress" : "unplayed";
}

// Current streak: consecutive most-recent days won. Today not being finished yet
// doesn't break it (the day isn't over), but any other non-win does.
function currentStreakOf(entries) {
  let streak = 0;
  for (let i = 0; i < entries.length; i++) {
    const status = statusOf(entries[i].saved);
    if (i === 0 && (status === "unplayed" || status === "in-progress")) continue;
    if (status === "won") streak++;
    else break;
  }
  return streak;
}

// Longest run of consecutive won days over the whole range; any non-win (a loss
// or an unplayed day) resets the run.
function maxStreakOf(entries) {
  let max = 0;
  let run = 0;
  for (const { saved } of entries) {
    if (statusOf(saved) === "won") {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

// Per-mode stats: daily saves combined with the random aggregate. Streaks come
// from daily only (random games have no date and no streak).
export function computeModeStats(dailyEntries, randomAgg) {
  let played = 0;
  let won = 0;
  const dist = new Map(); // guesses-to-win -> number of wins

  for (const { saved } of dailyEntries) {
    if (!saved) continue;
    if (saved.done) played++;
    if (saved.won) {
      won++;
      const n = (saved.guesses || []).length;
      dist.set(n, (dist.get(n) || 0) + 1);
    }
  }
  if (randomAgg) {
    played += randomAgg.played || 0;
    won += randomAgg.won || 0;
    for (const [n, count] of Object.entries(randomAgg.dist || {})) {
      dist.set(Number(n), (dist.get(Number(n)) || 0) + count);
    }
  }

  // Only the guess-counts that actually occurred, ascending: keeps the histogram
  // compact whether wins take 4 guesses (classic) or 38 (crossword).
  const distribution = [...dist.entries()]
    .map(([guesses, count]) => ({ guesses, count }))
    .sort((a, b) => a.guesses - b.guesses);

  return {
    played,
    won,
    winRate: played ? Math.round((won / played) * 100) : 0,
    currentStreak: currentStreakOf(dailyEntries),
    maxStreak: maxStreakOf(dailyEntries),
    distribution,
  };
}

// The most-frequently guessed words, pooled across every source (both modes,
// daily + random). `sources` is an array of { dailyEntries, randomAgg }.
export function computeTopWords(sources, { limit = 5 } = {}) {
  const counts = new Map();
  for (const { dailyEntries, randomAgg } of sources) {
    for (const { saved } of dailyEntries || []) {
      for (const g of (saved && saved.guesses) || []) {
        if (g && g.word) counts.set(g.word, (counts.get(g.word) || 0) + 1);
      }
    }
    for (const [word, count] of Object.entries((randomAgg && randomAgg.words) || {})) {
      counts.set(word, (counts.get(word) || 0) + count);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
