import { getAllLinks, getLink, normalizeShortcut } from "./lib/storage.js";

const PLACES = [
  { name: "Iceland", file: "wallpapers/iceland.jpg" },
  { name: "Tokyo, Japan", file: "wallpapers/tokyo.jpg" },
  { name: "Kyoto, Japan", file: "wallpapers/kyoto.jpg" },
  { name: "Santorini, Greece", file: "wallpapers/santorini.jpg" },
  { name: "Athens, Greece", file: "wallpapers/athens.jpg" },
  { name: "Barcelona, Spain", file: "wallpapers/barcelona.jpg" },
  { name: "Auckland, New Zealand", file: "wallpapers/auckland.jpg" },
  { name: "Lisbon, Portugal", file: "wallpapers/lisbon.jpg" },
  { name: "Morocco", file: "wallpapers/morocco.jpg" },
  { name: "Madrid, Spain", file: "wallpapers/madrid.jpg" },
  { name: "Dubrovnik, Croatia", file: "wallpapers/dubrovnik.jpg" },
  { name: "Split, Croatia", file: "wallpapers/split.jpg" },
];

const SETTINGS_KEY = "newtab_prefs";

const backdropEl = document.getElementById("backdrop");
const clockEl = document.getElementById("clock");
const goForm = document.getElementById("go-form");
const goInput = document.getElementById("go-input");
const shortcutsGrid = document.getElementById("shortcuts-grid");
const placeLabel = document.getElementById("place-label");
const nextPlaceBtn = document.getElementById("next-place");
const modeToggleBtn = document.getElementById("mode-toggle");

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getPrefs() {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return res[SETTINGS_KEY] || { mode: "daily", date: "", index: 0 };
}

async function savePrefs(prefs) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: prefs });
}

function applyPlace(index) {
  const place = PLACES[((index % PLACES.length) + PLACES.length) % PLACES.length];
  backdropEl.style.backgroundImage = `url("${chrome.runtime.getURL(place.file)}")`;
  placeLabel.textContent = `📍 ${place.name}`;
}

async function initBackground() {
  const prefs = await getPrefs();
  const today = todayKey();
  let index = prefs.index ?? 0;

  if (prefs.mode === "tab") {
    index = (index + 1) % PLACES.length;
    await savePrefs({ ...prefs, index, date: today });
  } else {
    if (prefs.date !== today) {
      const days = Math.floor(Date.now() / 86400000);
      index = days % PLACES.length;
      await savePrefs({ ...prefs, mode: "daily", date: today, index });
    }
  }

  modeToggleBtn.textContent = prefs.mode === "tab" ? "Every Tab" : "Daily";
  applyPlace(index);
}

async function renderShortcuts() {
  const links = await getAllLinks();
  shortcutsGrid.textContent = "";

  const entries = Object.entries(links)
    .sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);

  if (entries.length === 0) {
    const addTile = document.createElement("a");
    addTile.className = "shortcut-tile";
    addTile.href = "options.html";
    addTile.textContent = "+ Add your first go/ shortcut";
    shortcutsGrid.appendChild(addTile);
    return;
  }

  for (const [shortcut, entry] of entries) {
    const tile = document.createElement("a");
    tile.className = "shortcut-tile";
    tile.href = entry.url;
    tile.title = entry.url;

    const mono = document.createElement("span");
    mono.className = "mono";
    mono.textContent = `go/${shortcut}`;
    tile.appendChild(mono);

    if (entry.note) {
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = entry.note;
      tile.appendChild(label);
    }

    shortcutsGrid.appendChild(tile);
  }
}

goForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const shortcut = normalizeShortcut(goInput.value);
  if (!shortcut) {
    window.location.href = "options.html";
    return;
  }
  const link = await getLink(shortcut);
  if (link) {
    window.location.href = link.url;
  } else {
    window.location.href = `notfound.html?s=${encodeURIComponent(shortcut)}`;
  }
});

nextPlaceBtn.addEventListener("click", async () => {
  const prefs = await getPrefs();
  const nextIndex = ((prefs.index ?? 0) + 1) % PLACES.length;
  await savePrefs({ ...prefs, date: todayKey(), index: nextIndex });
  applyPlace(nextIndex);
});

modeToggleBtn.addEventListener("click", async () => {
  const prefs = await getPrefs();
  const nextMode = prefs.mode === "tab" ? "daily" : "tab";
  await savePrefs({ ...prefs, mode: nextMode, date: todayKey() });
  modeToggleBtn.textContent = nextMode === "tab" ? "Every Tab" : "Daily";
});

updateClock();
setInterval(updateClock, 15000);
await initBackground();
await renderShortcuts();
