import { deleteLink, getAllLinks, saveLink } from "./lib/storage.js";
import { renderLinkList, showStatus } from "./lib/ui.js";

const form = document.getElementById("link-form");
const shortcutInput = document.getElementById("shortcut-input");
const urlInput = document.getElementById("url-input");
const noteInput = document.getElementById("note-input");
const saveBtn = document.getElementById("save-btn");
const cancelEditBtn = document.getElementById("cancel-edit");
const searchInput = document.getElementById("search-input");
const linkListEl = document.getElementById("link-list");
const linkCountEl = document.getElementById("link-count");
const statusEl = document.getElementById("status-msg");
const openDashboardBtn = document.getElementById("open-dashboard");

let cachedLinks = {};
let editingShortcut = null;

async function refresh() {
  cachedLinks = await getAllLinks();
  linkCountEl.textContent = String(Object.keys(cachedLinks).length);

  renderLinkList({
    container: linkListEl,
    links: cachedLinks,
    filter: searchInput.value,
    sortBy: "recent",
    onOpen: (url) => chrome.tabs.create({ url }),
    onEdit: (shortcut, entry) => startEdit(shortcut, entry),
    onDelete: (shortcut, entry) => handleDelete(shortcut, entry),
    onUseStarter: async (starter) => {
      await saveLink(starter.shortcut, starter.url, starter.note);
      showStatus(statusEl, `Saved go/${starter.shortcut}`, "success");
      await refresh();
    },
  });
}

function startEdit(shortcut, entry) {
  editingShortcut = shortcut;
  shortcutInput.value = shortcut;
  urlInput.value = entry.url;
  noteInput.value = entry.note || "";
  saveBtn.textContent = "Update";
  cancelEditBtn.classList.remove("hidden");
  shortcutInput.focus();
  shortcutInput.select();
}

function resetForm(prefillUrl = "") {
  editingShortcut = null;
  shortcutInput.value = "";
  urlInput.value = prefillUrl;
  noteInput.value = "";
  saveBtn.textContent = "Save";
  cancelEditBtn.classList.add("hidden");
}

async function handleDelete(shortcut, entry) {
  await deleteLink(shortcut);
  if (editingShortcut === shortcut) {
    resetForm();
  }
  await refresh();

  showStatus(statusEl, `Deleted go/${shortcut}`, "success", {
    label: "Undo",
    onClick: async () => {
      await saveLink(shortcut, entry.url, entry.note);
      await refresh();
    },
  });
}

async function prefillCurrentTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:\/\//i.test(tab.url)) {
      urlInput.value = tab.url;
    }
  } catch {
    // Ignore if active tab is inaccessible
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { shortcut } = await saveLink(
      shortcutInput.value,
      urlInput.value,
      noteInput.value,
      editingShortcut
    );
    const wasEditing = Boolean(editingShortcut);
    resetForm();
    await refresh();
    showStatus(
      statusEl,
      wasEditing ? `Updated go/${shortcut}` : `Saved go/${shortcut}`,
      "success"
    );
    shortcutInput.focus();
  } catch (err) {
    showStatus(statusEl, err.message, "error");
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetForm();
  prefillCurrentTabUrl();
});

searchInput.addEventListener("input", () => {
  renderLinkList({
    container: linkListEl,
    links: cachedLinks,
    filter: searchInput.value,
    sortBy: "recent",
    onOpen: (url) => chrome.tabs.create({ url }),
    onEdit: (shortcut, entry) => startEdit(shortcut, entry),
    onDelete: (shortcut, entry) => handleDelete(shortcut, entry),
  });
});

openDashboardBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Initialize popup
await refresh();
await prefillCurrentTabUrl();
