import { normalizeShortcut, saveLink } from "./lib/storage.js";
import { showStatus } from "./lib/ui.js";

const params = new URLSearchParams(window.location.search);
const requested = normalizeShortcut(params.get("s") || "");

const heading = document.getElementById("heading");
const shortcutInput = document.getElementById("shortcut-input");
const urlInput = document.getElementById("url-input");
const noteInput = document.getElementById("note-input");
const form = document.getElementById("create-form");
const statusEl = document.getElementById("status-msg");

if (requested) {
  heading.textContent = `go/${requested} doesn’t exist yet`;
  shortcutInput.value = requested;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { entry } = await saveLink(
      shortcutInput.value,
      urlInput.value,
      noteInput.value
    );
    window.location.replace(entry.url);
  } catch (err) {
    showStatus(statusEl, err.message, "error");
  }
});
