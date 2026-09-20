import { t } from "../i18n";
import { getProgressSummary, reloadProgress } from "../progress";
import { reloadPreferences } from "../settings/preferences";
import { reloadKeybindings } from "../settings/keybindings";
import { exportSaveArchive, importSaveArchive, MAX_ARCHIVE_BYTES, parseSaveArchive, recoverSaveImport } from "../saveArchive";

export class SaveMenu {
  private readonly backdrop = document.createElement("div");
  private readonly panel = document.createElement("section");
  private readonly title = document.createElement("h2");
  private readonly summary = document.createElement("p");
  private readonly status = document.createElement("p");
  private readonly buttons: HTMLButtonElement[] = [];
  private pending: string | null = null;
  private busy = false;
  private destroyed = false;

  constructor(private readonly onClose: () => void) {
    this.backdrop.className = "pause-menu-backdrop";
    this.panel.className = "pause-menu save-menu";
    this.panel.tabIndex = -1;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.title.id = "save-menu-title";
    this.panel.setAttribute("aria-labelledby", this.title.id);
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.panel.append(this.title, this.summary, this.status);
    for (const action of [() => this.export(), () => this.import(), () => this.close()]) {
      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", () => { void action(); });
      this.buttons.push(button); this.panel.append(button);
    }
    this.backdrop.append(this.panel); document.body.append(this.backdrop);
    window.addEventListener("keydown", this.handleKey, true);
    this.refresh(); this.panel.focus();
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("keydown", this.handleKey, true);
    this.backdrop.remove();
  }

  private refresh() {
    const summary = getProgressSummary();
    this.title.textContent = t("menu.saves");
    this.summary.textContent = t("archive.summary", { levels: summary.completedLevels, cards: summary.unlockedCards });
    this.buttons[0].textContent = t("archive.export");
    this.buttons[0].hidden = this.pending !== null;
    this.buttons[1].textContent = t(this.pending ? "button.confirm" : "archive.import");
    this.buttons[2].textContent = t(this.pending ? "button.cancel" : "button.back");
    for (const button of this.buttons) button.disabled = this.busy;
  }

  private async export() {
    if (this.busy) return;
    this.busy = true; this.refresh();
    try {
      recoverSaveImport();
      const text = exportSaveArchive();
      if (window.charsetDesktop) {
        if (!await window.charsetDesktop.exportSave(text)) return;
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url; link.download = `Charset-save-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      this.status.textContent = t("archive.exported");
    } catch { this.status.textContent = t("archive.failed"); }
    finally { this.busy = false; if (!this.destroyed) this.refresh(); }
  }

  private async import() {
    if (this.busy) return;
    this.busy = true; this.refresh();
    try {
      if (this.pending !== null) {
        importSaveArchive(this.pending);
        reloadProgress(); reloadPreferences(); reloadKeybindings();
        this.pending = null;
        this.status.textContent = t("archive.imported");
      } else {
        const text = window.charsetDesktop ? await window.charsetDesktop.importSave() : await this.pickFile();
        if (text === null || this.destroyed) return;
        const archive = parseSaveArchive(text);
        this.pending = text;
        this.status.textContent = t("archive.confirm", { date: new Date(archive.exportedAt).toLocaleString() });
      }
    } catch { this.pending = null; this.status.textContent = t("archive.failed"); }
    finally { this.busy = false; if (!this.destroyed) this.refresh(); }
  }

  private pickFile(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
      const done = (value: string | null, error?: unknown) => { input.remove(); if (error) reject(error); else resolve(value); };
      input.addEventListener("cancel", () => done(null), { once: true });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return done(null);
        if (file.size > MAX_ARCHIVE_BYTES) return done(null, new Error("Save file too large"));
        try { done(await file.text()); } catch (error) { done(null, error); }
      }, { once: true });
      document.body.append(input); input.click();
    });
  }

  private close() {
    if (this.busy) return;
    if (this.pending !== null) { this.pending = null; this.status.textContent = ""; this.refresh(); return; }
    this.onClose();
  }

  private readonly handleKey = (event: KeyboardEvent) => {
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); this.close(); }
    if (event.key === "Tab") {
      event.preventDefault();
      const buttons = this.buttons.filter(button => !button.hidden && !button.disabled);
      if (!buttons.length) return;
      const index = buttons.findIndex(button => button === document.activeElement);
      const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
  };
}
