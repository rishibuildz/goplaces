import { getAllLinks, getLink, normalizeShortcut } from "./lib/storage.js";

const SEARCH_ENGINES = [
  { hostPattern: /(^|\.)google\./i, pathPrefix: "/search", param: "q" },
  { hostPattern: /(^|\.)bing\.com$/i, pathPrefix: "/search", param: "q" },
  { hostPattern: /(^|\.)duckduckgo\.com$/i, pathPrefix: "/", param: "q" },
  { hostPattern: /(^|\.)search\.yahoo\.com$/i, pathPrefix: "/search", param: "p" },
  { hostPattern: /(^|\.)search\.brave\.com$/i, pathPrefix: "/search", param: "q" },
  { hostPattern: /(^|\.)ecosia\.org$/i, pathPrefix: "/search", param: "q" },
  { hostPattern: /(^|\.)kagi\.com$/i, pathPrefix: "/search", param: "q" },
  { hostPattern: /(^|\.)startpage\.com$/i, pathPrefix: "/", param: "query" },
];

let syncQueue = Promise.resolve();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Rebuilds declarativeNetRequest dynamic rules from saved go links so
 * http://go/<shortcut> and https://go/<shortcut> redirect before DNS lookup.
 */
function scheduleRuleSync() {
  syncQueue = syncQueue
    .then(async () => {
      const links = await getAllLinks();
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const removeRuleIds = existingRules.map((r) => r.id);

      const addRules = [
        {
          id: 1,
          priority: 2,
          action: {
            type: "redirect",
            redirect: { url: chrome.runtime.getURL("options.html") },
          },
          condition: {
            regexFilter: "^https?://go/?$",
            isUrlFilterCaseSensitive: false,
            resourceTypes: ["main_frame"],
          },
        },
        {
          id: 2,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              regexSubstitution: `${chrome.runtime.getURL("notfound.html")}?s=\\1`,
            },
          },
          condition: {
            regexFilter: "^https?://go/([^?#]+)",
            isUrlFilterCaseSensitive: false,
            resourceTypes: ["main_frame"],
          },
        },
      ];

      let nextId = 100;
      for (const [shortcut, entry] of Object.entries(links)) {
        if (nextId >= 1050) break; // Respect browser regex rule quota
        addRules.push({
          id: nextId++,
          priority: 3,
          action: {
            type: "redirect",
            redirect: { url: entry.url },
          },
          condition: {
            regexFilter: `^https?://go/${escapeRegex(shortcut)}/?(?:[?#].*)?$`,
            isUrlFilterCaseSensitive: false,
            resourceTypes: ["main_frame"],
          },
        });
      }

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules,
      });
    })
    .catch((err) => {
      console.error("GoPlaces: Failed to sync redirect rules", err);
    });

  return syncQueue;
}

/**
 * Extracts a go/<shortcut> query when the browser sends it to a search engine
 * instead of navigating directly to http://go/<shortcut>.
 */
function extractGoShortcutFromSearchUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return null;
  }

  for (const engine of SEARCH_ENGINES) {
    if (!engine.hostPattern.test(parsed.hostname)) continue;
    if (!parsed.pathname.startsWith(engine.pathPrefix)) continue;

    const query = (parsed.searchParams.get(engine.param) || "").trim();
    const match = query.match(/^go\/(.*)$/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function resolveTargetUrl(rawShortcut) {
  const shortcut = normalizeShortcut(rawShortcut);
  if (!shortcut) {
    return chrome.runtime.getURL("options.html");
  }
  const link = await getLink(shortcut);
  if (link) {
    return link.url;
  }
  return chrome.runtime.getURL(`notfound.html?s=${encodeURIComponent(shortcut)}`);
}

// Keep DNR rules synchronized on install, startup, and storage changes
chrome.runtime.onInstalled.addListener(() => {
  scheduleRuleSync();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleRuleSync();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync") {
    scheduleRuleSync();
  }
});

// Intercept search-engine fallback for "go/<shortcut>"
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const rawShortcut = extractGoShortcutFromSearchUrl(details.url);
  if (rawShortcut === null) return;

  const targetUrl = await resolveTargetUrl(rawShortcut);
  try {
    await chrome.tabs.update(details.tabId, { url: targetUrl });
  } catch (err) {
    console.error("GoPlaces: Failed to redirect tab", err);
  }
});

// Omnibox support: type "go" + Tab + shortcut
chrome.omnibox.setDefaultSuggestion({
  description: "Open a GoPlaces shortcut (e.g. go/mail) or press Enter for dashboard",
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const query = normalizeShortcut(text);
  const links = await getAllLinks();
  const matches = Object.entries(links)
    .filter(([shortcut, entry]) => {
      if (!query) return true;
      return (
        shortcut.includes(query) ||
        entry.url.toLowerCase().includes(query) ||
        entry.note.toLowerCase().includes(query)
      );
    })
    .slice(0, 6)
    .map(([shortcut, entry]) => ({
      content: shortcut,
      description: `<match>go/${escapeXml(shortcut)}</match> <dim>→ ${escapeXml(entry.url)}</dim>`,
    }));

  suggest(matches);
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const targetUrl = await resolveTargetUrl(text);
  if (disposition === "currentTab") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { url: targetUrl });
      return;
    }
  }
  await chrome.tabs.create({ url: targetUrl });
});

// Ensure rules are synced when service worker wakes up
scheduleRuleSync();
