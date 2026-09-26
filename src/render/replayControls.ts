import { createElement, Play, Pause, RotateCcw, ArrowLeft, type IconNode } from "lucide";
import { t } from "../i18n";
import { playUiClick } from "../audio/player";
import { replayTime } from "./replayMenu";

export class ReplayControls {
  private readonly root = document.createElement("div");
  private readonly time = document.createElement("span");
  private readonly toggle: HTMLButtonElement;
  paused = false;
  speed = 1;
  private finished = false;

  constructor(private readonly restart: () => void, private readonly exit: () => void) {
    this.root.className = "replay-controls"; this.root.setAttribute("role", "toolbar"); this.root.setAttribute("aria-label", t("menu.replays"));
    this.button(ArrowLeft, t("replay.exit"), exit);
    this.toggle = this.button(Pause, t("replay.pause"), () => this.togglePause());
    this.button(RotateCcw, t("replay.restart"), restart);
    const select = document.createElement("select"); select.setAttribute("aria-label", t("replay.speed")); select.title = t("replay.speed");
    for (const speed of [.5, 1, 2, 4]) { const option = document.createElement("option"); option.value = String(speed); option.textContent = `${speed}x`; select.append(option); }
    select.value = "1"; select.onchange = () => { this.speed = Number(select.value); };
    this.root.append(select, this.time); document.body.append(this.root);
    window.addEventListener("keydown", this.key, true);
  }

  private button(icon: IconNode, label: string, action: () => void) {
    const button = document.createElement("button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label);
    button.append(createElement(icon, { width: 18, height: 18 })); button.onclick = () => { playUiClick(); action(); };
    this.root.append(button); return button;
  }

  togglePause() {
    if (this.finished) { this.restart(); return; }
    this.paused = !this.paused;
    this.toggle.replaceChildren(createElement(this.paused ? Play : Pause, { width: 18, height: 18 }));
    this.toggle.title = t(this.paused ? "replay.play" : "replay.pause"); this.toggle.setAttribute("aria-label", this.toggle.title);
  }

  update(tick: number, end: number, finished: boolean) {
    if (finished && !this.finished) {
      this.toggle.replaceChildren(createElement(RotateCcw, { width: 18, height: 18 }));
      this.toggle.title = t("replay.restart"); this.toggle.setAttribute("aria-label", this.toggle.title);
    }
    this.finished = finished;
    this.time.textContent = `${replayTime(tick)} / ${replayTime(end)}${finished ? ` · ${t("replay.finished")}` : ""}`;
  }

  destroy() { this.root.remove(); window.removeEventListener("keydown", this.key, true); }
  private readonly key = (event: KeyboardEvent) => {
    if (event.code === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); this.exit(); return; }
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.code === "Space") { event.preventDefault(); this.togglePause(); }
  };
}
