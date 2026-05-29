// Robust mobile detection: any positive signal returns true. UA-CH is a
// positive-only signal (don't trust .mobile === false, since some browsers
// report it incorrectly in privacy modes).
export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true;
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 0 && typeof window !== "undefined" && window.matchMedia) {
    try { if (window.matchMedia("(pointer: coarse)").matches) return true; } catch {}
  }
  return false;
}

// Copy text using the best available API; falls back to a hidden textarea + execCommand.
// Returns true on success, false on failure.
export async function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    const previouslyFocused = document.activeElement;
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand && document.execCommand("copy");
    document.body.removeChild(ta);
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      try { previouslyFocused.focus(); } catch {}
    }
    return !!ok;
  } catch {
    return false;
  }
}

// Share via the Web Share API on mobile, otherwise copy to clipboard.
// Returns "shared" | "cancelled" | "copied" | "failed" so callers can message.
export async function shareOrCopy(text) {
  if (isMobileDevice() && navigator.share) {
    try { await navigator.share({ text }); return "shared"; }
    catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
    }
  }
  return (await copyToClipboard(text)) ? "copied" : "failed";
}
