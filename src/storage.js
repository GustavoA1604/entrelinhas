// localStorage helpers shared by both game modes. All access is wrapped so a
// disabled/full storage (private mode, quota) never throws.

export function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// One-time migration of a legacy single-slot key into a per-date entry.
export function migrateLegacyDaily(legacyKey, prefix) {
  try {
    const legacy = readJSON(legacyKey);
    if (legacy && typeof legacy === "object" && legacy.dateKey) {
      if (!localStorage.getItem(prefix + legacy.dateKey)) {
        writeJSON(prefix + legacy.dateKey, legacy);
      }
      localStorage.removeItem(legacyKey);
    }
  } catch {}
}
