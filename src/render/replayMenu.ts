import { playUiClick } from "../audio/player";
import { t } from "../i18n";
import { exportReplayFile, MAX_REPLAY_BYTES, parseReplayFile, replayLibrary, replayStartTick, validateReplayEntry, type ReplayEntry } from "../replays";

export function replayTime(tick: number) {
  const seconds = Math.floor(tick / 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export class ReplayMenu {
  private readonly backdrop = document.createElement("div");
  private readonly panel = document.createElement("section");
  private readonly list = document.createElement("div");
  private readonly status = document.createElement("p");
  private destroyed = false;
  private fileInput?: HTMLInputElement;

  constructor(private readonly onClose: () => void, private readonly onWatch: (entry: ReplayEntry) => void) {
    this.backdrop.className = "pause-menu-backdrop";
    this.panel.className = "pause-menu replay-menu";
    this.panel.tabIndex = -1; this.panel.setAttribute("role", "dialog"); this.panel.setAttribute("aria-modal", "true");
    const title = document.createElement("h2"); title.textContent = t("menu.replays");
    title.id = "replay-menu-title"; this.panel.setAttribute("aria-labelledby", title.id);
    const heading = document.createElement("h3"); heading.textContent = t("replay.recent");
    this.status.setAttribute("role", "status"); this.status.setAttribute("aria-live", "polite");
    this.panel.append(title, heading, this.list, this.status);
    this.button(this.panel, t("replay.import"), () => void this.import());
    this.button(this.panel, t("button.back"), onClose);
    this.backdrop.append(this.panel); document.body.append(this.backdrop);
    window.addEventListener("keydown", this.key, true);
    this.panel.focus(); void this.refresh();
  }

  destroy() { this.destroyed = true; this.fileInput?.remove(); this.backdrop.remove(); window.removeEventListener("keydown", this.key, true); }

  private button(parent: HTMLElement, text: string, action: () => void) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
    button.onclick = () => { playUiClick(); action(); }; parent.append(button); return button;
  }

  private async refresh() {
    const entries = await replayLibrary.recent();
    if (this.destroyed) return;
    this.list.replaceChildren();
    if (!entries.length) this.list.textContent = t("replay.empty");
    for (const entry of entries) this.row(entry, this.list);
  }

  private row(entry: ReplayEntry, parent: HTMLElement) {
    const row = document.createElement("article"); row.className = "replay-row";
    const label = document.createElement("strong"); label.textContent = `${entry.replay.levelId} · ${t("replay.difficulty", { value: entry.replay.difficulty })}`;
    const details = document.createElement("p");
    let start = 0; try { start = replayStartTick(entry.replay); } catch { /* Invalid files remain exportable for diagnosis. */ }
    details.textContent = `${new Date(entry.savedAt).toLocaleString()} · ${t(`replay.${entry.outcome}`)} · ${replayTime(start)}–${replayTime(entry.replay.endTick)}`;
    row.append(label, details);
    const actions = document.createElement("div"); actions.className = "replay-actions";
    this.button(actions, t("replay.watch"), () => { try { validateReplayEntry(entry); this.onWatch(entry); } catch { this.status.textContent = t("replay.invalid"); } });
    this.button(actions, t("replay.export"), () => void this.export(entry));
    row.append(actions); parent.append(row);
  }

  private async export(entry: ReplayEntry) {
    try {
      const text = exportReplayFile(entry);
      if (window.charsetDesktop?.exportReplay) { await window.charsetDesktop.exportReplay(text); return; }
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url;
      link.download = `Charset-replay-${entry.replay.levelId}-${new Date(entry.savedAt).toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { this.status.textContent = t("replay.invalid"); }
  }

  private async import() {
    const accept = (text: string) => {
      if (this.destroyed) return;
      try {
        const entry = parseReplayFile(text);
        this.panel.querySelector(".replay-imported")?.remove();
        const imported = document.createElement("div"); imported.className = "replay-imported";
        const label = document.createElement("h3"); label.textContent = t("replay.imported"); imported.append(label);
        this.row(entry, imported); this.panel.insertBefore(imported, this.status); this.status.textContent = "";
      } catch { this.status.textContent = t("replay.invalid"); }
    };
    if (window.charsetDesktop?.importReplay) {
      try { const text = await window.charsetDesktop.importReplay(); if (text !== null) accept(text); }
      catch { this.status.textContent = t("replay.invalid"); }
      return;
    }
    this.fileInput?.remove();
    const input = this.fileInput = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
    input.oncancel = () => input.remove();
    input.onchange = async () => {
      const file = input.files?.[0]; input.remove(); if (!file) return;
      try { if (file.size > MAX_REPLAY_BYTES) throw Error("Too large"); accept(await file.text()); }
      catch { this.status.textContent = t("replay.invalid"); }
    };
    document.body.append(input); input.click();
  }

  private readonly key = (event: KeyboardEvent) => {
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); this.onClose(); }
    if (event.key === "Tab") {
      event.preventDefault(); const buttons = [...this.panel.querySelectorAll("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  };
}
