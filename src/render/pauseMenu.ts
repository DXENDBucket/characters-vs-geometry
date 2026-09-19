import { t } from "../i18n";

interface PauseMenuActions {
  resume: () => void;
  settings: () => void;
  restart: () => void;
  exit: () => void;
}

/** DOM backdrop blur keeps the paused canvas intact, including on Canvas renderers. */
export class PauseMenu {
  private readonly backdrop = document.createElement("div");
  private readonly panel = document.createElement("section");
  private readonly title = document.createElement("h2");
  private readonly buttons: Array<{ element: HTMLButtonElement; key: string }> = [];
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly actions: PauseMenuActions) {
    this.backdrop.className = "pause-menu-backdrop";
    this.backdrop.hidden = true;
    this.panel.className = "pause-menu";
    this.panel.tabIndex = -1;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.title.id = "pause-menu-title";
    this.panel.setAttribute("aria-labelledby", this.title.id);
    this.panel.append(this.title);
    for (const [action, key] of [
      ["resume", "button.resume"],
      ["settings", "button.settings"],
      ["restart", "button.restart"],
      ["exit", "button.exit"]
    ] as const) {
      const element = document.createElement("button");
      element.type = "button";
      element.addEventListener("click", () => this.actions[action]());
      this.buttons.push({ element, key });
      this.panel.append(element);
    }
    this.backdrop.append(this.panel);
    document.body.append(this.backdrop);
    window.addEventListener("keydown", this.handleKey, true);
  }

  show() {
    if (!this.backdrop.hidden) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.title.textContent = t("button.menu");
    for (const { element, key } of this.buttons) element.textContent = t(key);
    this.backdrop.hidden = false;
    this.panel.focus();
  }

  hide() {
    this.backdrop.hidden = true;
    this.previousFocus?.focus();
    this.previousFocus = null;
  }

  destroy() {
    this.hide();
    window.removeEventListener("keydown", this.handleKey, true);
    this.backdrop.remove();
  }

  private readonly handleKey = (event: KeyboardEvent) => {
    if (this.backdrop.hidden) return;
    // Consume shortcuts before Phaser receives them; keep focus inside the modal.
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (!event.repeat) this.actions.resume();
    } else if (event.key === "Tab") {
      event.preventDefault();
      const index = this.buttons.findIndex(({ element }) => element === document.activeElement);
      const next = index < 0
        ? event.shiftKey ? this.buttons.length - 1 : 0
        : (index + (event.shiftKey ? -1 : 1) + this.buttons.length) % this.buttons.length;
      this.buttons[next].element.focus();
    }
  };
}
