import {
  deleteLink,
  exportLinks,
  getAllLinks,
  importLinks,
  saveLink,
} from "./lib/storage.js";
import { renderLinkList, showStatus } from "./lib/ui.js";

const form = document.getElementById("link-form");
const formTitle = document.getElementById("form-title");
const shortcutInput = document.getElementById("shortcut-input");
const urlInput = document.getElementById("url-input");
const noteInput = document.getElementById("note-input");
const saveBtn = document.getElementById("save-btn");
const cancelEditBtn = document.getElementById("cancel-edit");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const linkListEl = document.getElementById("link-list");
const linkCountEl = document.getElementById("link-count");
const statusEl = document.getElementById("status-msg");
const exportBtn = document.getElementById("export-btn");
const importInput = document.getElementById("import-input");

let cachedLinks = {};
let editingShortcut = null;

function render() {
  linkCountEl.textContent = String(Object.keys(cachedLinks).length);
  renderLinkList({
    container: linkListEl,
    links: cachedLinks,
    filter: searchInput.value,
    sortBy: sortSelect.value,
    onOpen: (url) => window.open(url, "_blank", "noopener"),
    onEdit: (shortcut, entry) => startEdit(shortcut, entry),
    onDelete: (shortcut, entry) => handleDelete(shortcut, entry),
    onUseStarter: async (starter) => {
      await saveLink(starter.shortcut, starter.url, starter.note);
      showStatus(statusEl, `Saved go/${starter.shortcut}`, "success");
      await refresh();
    },
  });
}

async function refresh() {
  cachedLinks = await getAllLinks();
  render();
}

function startEdit(shortcut, entry) {
  editingShortcut = shortcut;
  formTitle.textContent = `Editing go/${shortcut}`;
  shortcutInput.value = shortcut;
  urlInput.value = entry.url;
  noteInput.value = entry.note || "";
  saveBtn.textContent = "Update Link";
  cancelEditBtn.classList.remove("hidden");
  shortcutInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  editingShortcut = null;
  formTitle.textContent = "Create a Go Link";
  shortcutInput.value = "";
  urlInput.value = "";
  noteInput.value = "";
  saveBtn.textContent = "Save Link";
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
  } catch (err) {
    showStatus(statusEl, err.message, "error");
  }
});

cancelEditBtn.addEventListener("click", resetForm);
searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);

exportBtn.addEventListener("click", async () => {
  const payload = await exportLinks();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goplaces-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus(statusEl, "Exported shortcuts to JSON.", "success");
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const count = await importLinks(data, { replace: false });
    await refresh();
    showStatus(statusEl, `Imported ${count} shortcut(s).`, "success");
  } catch (err) {
    showStatus(statusEl, err.message || "Failed to import JSON.", "error");
  } finally {
    importInput.value = "";
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    refresh();
  }
});

await refresh();
