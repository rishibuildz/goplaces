/**
 * Shared DOM rendering and UI helpers for GoPlaces popup and options pages.
 */

export const STARTER_SHORTCUTS = [
  { shortcut: "mail", url: "https://mail.google.com", note: "Gmail" },
  { shortcut: "drive", url: "https://drive.google.com", note: "Google Drive" },
  { shortcut: "cal", url: "https://calendar.google.com", note: "Calendar" },
  { shortcut: "news", url: "https://news.google.com", note: "News" },
];

let statusTimer = null;

export function showStatus(el, message, type = "success", action = null) {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  el.textContent = "";
  el.className = `status-msg visible ${type}`;

  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  el.appendChild(textSpan);

  if (action && typeof action.onClick === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      action.onClick();
      el.className = "status-msg";
    });
    el.appendChild(btn);
  }

  statusTimer = setTimeout(() => {
    el.className = "status-msg";
  }, action ? 5000 : 3000);
}

export function renderLinkList({
  container,
  links,
  filter = "",
  sortBy = "recent",
  onOpen,
  onEdit,
  onDelete,
  onUseStarter,
}) {
  container.textContent = "";
  const query = filter.trim().toLowerCase();

  let entries = Object.entries(links);

  if (query) {
    entries = entries.filter(([shortcut, entry]) => {
      return (
        shortcut.includes(query) ||
        entry.url.toLowerCase().includes(query) ||
        (entry.note || "").toLowerCase().includes(query)
      );
    });
  }

  if (sortBy === "alpha") {
    entries.sort(([a], [b]) => a.localeCompare(b));
  } else {
    entries.sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const msg = document.createElement("p");
    msg.textContent = query
      ? `No shortcuts matching "${filter}".`
      : "No go links yet. Add one above or try a starter:";
    empty.appendChild(msg);

    if (!query && onUseStarter) {
      const chipRow = document.createElement("div");
      chipRow.className = "chip-row";
      for (const starter of STARTER_SHORTCUTS) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = `go/${starter.shortcut}`;
        chip.title = starter.url;
        chip.addEventListener("click", () => onUseStarter(starter));
        chipRow.appendChild(chip);
      }
      empty.appendChild(chipRow);
    }

    container.appendChild(empty);
    return;
  }

  for (const [shortcut, entry] of entries) {
    const item = document.createElement("div");
    item.className = "link-item";

    const info = document.createElement("div");
    info.className = "link-info";
    info.title = `Open ${entry.url}`;
    info.addEventListener("click", () => onOpen(entry.url));

    const shortcutRow = document.createElement("div");
    shortcutRow.className = "link-shortcut";

    const shortcutText = document.createElement("span");
    shortcutText.textContent = `go/${shortcut}`;
    shortcutRow.appendChild(shortcutText);

    if (entry.note) {
      const noteBadge = document.createElement("span");
      noteBadge.className = "link-note";
      noteBadge.textContent = entry.note;
      shortcutRow.appendChild(noteBadge);
    }

    const urlText = document.createElement("div");
    urlText.className = "link-url";
    urlText.textContent = entry.url;

    info.appendChild(shortcutRow);
    info.appendChild(urlText);

    const actions = document.createElement("div");
    actions.className = "link-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-ghost btn-sm";
    editBtn.textContent = "Edit";
    editBtn.title = `Edit go/${shortcut}`;
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onEdit(shortcut, entry);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-danger-ghost btn-sm";
    delBtn.textContent = "Delete";
    delBtn.title = `Delete go/${shortcut}`;
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete(shortcut, entry);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  }
}
