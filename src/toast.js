let toastTimer = null;

export function showToast(text, kind = "") {
  const el = document.getElementById("toast");
  if (!el) return;
  if (!text) {
    el.classList.remove("show");
    return;
  }
  el.textContent = text;
  el.className = "toast" + (kind ? " " + kind : "");
  // Force reflow so re-triggering the same toast restarts the transition.
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
