/**
 * Shared storage and validation utilities for GoPlaces.
 * Stores each shortcut under a "g:<shortcut>" key in chrome.storage.sync
 * to avoid the 8KB per-item sync quota while supporting ~1,000+ links.
 */

export const KEY_PREFIX = "g:";
const SHORTCUT_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,63}$/;

/**
 * Normalizes user input into a clean shortcut key.
 * Strips leading "go/" or slashes, trims whitespace, and lowercases.
 */
export function normalizeShortcut(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\/go\//, "");
  s = s.replace(/^go\//, "");
  s = s.replace(/^\/+|\/+$/g, "");
  return s;
}

/**
 * Validates a normalized shortcut name.
 */
export function isValidShortcut(shortcut) {
  return SHORTCUT_PATTERN.test(shortcut);
}

/**
 * Normalizes and validates a destination URL.
 * Automatically prepends "https://" if no protocol is provided.
 * Returns null if the URL is invalid or uses an unsupported scheme.
 */
export function normalizeUrl(raw) {
  if (typeof raw !== "string") return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;

  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Returns all saved go links as a map: { [shortcut]: { url, note, updatedAt } }.
 */
export async function getAllLinks() {
  const all = await chrome.storage.sync.get(null);
  const links = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(KEY_PREFIX) && value && typeof value.url === "string") {
      const shortcut = key.slice(KEY_PREFIX.length);
      links[shortcut] = {
        url: value.url,
        note: value.note || "",
        updatedAt: value.updatedAt || 0,
      };
    }
  }
  return links;
}

/**
 * Looks up a single shortcut. Returns { url, note, updatedAt } or null.
 */
export async function getLink(rawShortcut) {
  const shortcut = normalizeShortcut(rawShortcut);
  if (!shortcut) return null;
  const key = `${KEY_PREFIX}${shortcut}`;
  const res = await chrome.storage.sync.get(key);
  return res[key] || null;
}

/**
 * Saves or updates a go link.
 * If renaming an existing shortcut, pass previousShortcut to remove the old key.
 */
export async function saveLink(rawShortcut, rawUrl, note = "", previousShortcut = null) {
  const shortcut = normalizeShortcut(rawShortcut);
  if (!isValidShortcut(shortcut)) {
    throw new Error(
      "Shortcut must start with a letter or number and only contain letters, numbers, '.', '-', '_', or '/'."
    );
  }

  const url = normalizeUrl(rawUrl);
  if (!url) {
    throw new Error("Please enter a valid http:// or https:// URL.");
  }

  const entry = {
    url,
    note: typeof note === "string" ? note.trim().slice(0, 120) : "",
    updatedAt: Date.now(),
  };

  await chrome.storage.sync.set({ [`${KEY_PREFIX}${shortcut}`]: entry });

  const prev = previousShortcut ? normalizeShortcut(previousShortcut) : null;
  if (prev && prev !== shortcut) {
    await chrome.storage.sync.remove(`${KEY_PREFIX}${prev}`);
  }

  return { shortcut, entry };
}

/**
 * Deletes a shortcut by name.
 */
export async function deleteLink(rawShortcut) {
  const shortcut = normalizeShortcut(rawShortcut);
  if (!shortcut) return;
  await chrome.storage.sync.remove(`${KEY_PREFIX}${shortcut}`);
}

/**
 * Exports all links as a clean JSON-serializable object.
 */
export async function exportLinks() {
  const links = await getAllLinks();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    links,
  };
}

/**
 * Imports links from an exported JSON payload or plain { shortcut: url | { url, note } } map.
 * Returns the count of imported links.
 */
export async function importLinks(payload, { replace = false } = {}) {
  const source = payload && typeof payload.links === "object" ? payload.links : payload;
  if (!source || typeof source !== "object") {
    throw new Error("Invalid import format.");
  }

  const toSet = {};
  let count = 0;

  for (const [rawKey, rawVal] of Object.entries(source)) {
    const shortcut = normalizeShortcut(rawKey);
    if (!isValidShortcut(shortcut)) continue;

    const rawUrl = typeof rawVal === "string" ? rawVal : rawVal?.url;
    const url = normalizeUrl(rawUrl);
    if (!url) continue;

    const note = typeof rawVal === "object" && typeof rawVal?.note === "string"
      ? rawVal.note.trim().slice(0, 120)
      : "";

    toSet[`${KEY_PREFIX}${shortcut}`] = {
      url,
      note,
      updatedAt: typeof rawVal?.updatedAt === "number" ? rawVal.updatedAt : Date.now(),
    };
    count += 1;
  }

  if (count === 0) {
    throw new Error("No valid shortcuts found in the imported file.");
  }

  if (replace) {
    const existing = await getAllLinks();
    const keysToRemove = Object.keys(existing).map((s) => `${KEY_PREFIX}${s}`);
    if (keysToRemove.length > 0) {
      await chrome.storage.sync.remove(keysToRemove);
    }
  }

  await chrome.storage.sync.set(toSet);
  return count;
}
