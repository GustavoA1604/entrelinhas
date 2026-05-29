// Pure progress math for the hint button's ring, shared by both game modes.
// `range` is how far the player still is from the answer(s); `start` is the
// range captured when the previous hint was unlocked (for the log-scale fill).
export function computeHintState({ range, start, rangeMax, idleMs, lastGuessAt, now = Date.now() }) {
  const rangeOk = range <= rangeMax;
  // Log-scale progress: linear plateaus at 95%+ when start >> rangeMax.
  // Log keeps the fill smooth across orders of magnitude.
  let rangeProgress;
  if (rangeOk || start <= rangeMax) {
    rangeProgress = 1;
  } else {
    const denom = Math.log(start / rangeMax);
    rangeProgress = denom > 0
      ? Math.max(0, Math.min(1, Math.log(start / range) / denom))
      : 1;
  }
  const idle = now - lastGuessAt;
  const idleProgress = Math.max(0, Math.min(1, idle / idleMs));
  const ready = rangeOk && idleProgress >= 1;
  const remainSec = Math.max(0, Math.ceil((idleMs - idle) / 1000));
  return { rangeOk, rangeProgress, idleProgress, ready, remainSec };
}
