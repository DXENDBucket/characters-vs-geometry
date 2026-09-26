import Phaser from "phaser";
import { DEFAULT_DIFFICULTY, DIFFICULTY_MAX, DIFFICULTY_MIN } from "../config";
import { allCardDefinitions } from "../registry/cardDefinitions";
import { levelNodes } from "../data/levels";
import { isCardUnlocked, isLevelCompleted, unlockedCardSlotCount } from "../progress";
import { copyBattlePolicy } from "../game/battlePolicy";
import { RESELECT_UNLOCK_LEVEL } from "../game/loadoutReselection";
import { CoopClient, coopAddress } from "../multiplayer/coopClient";
import type { CoopProfile, CoopState } from "../multiplayer/coopRoom";
import { RemoteBattleSession } from "../render/remoteBattleSession";
import { playUiClick } from "../audio/player";
import { createTowerWord } from "../render/towerWord";
import type { CardId } from "../types";
import { getSelectedDifficulty, setSelectedDifficulty } from "../settings/preferences";

export class CoopScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private client?: CoopClient;
  private actorId = "";
  private state?: CoopState;
  private profile?: CoopProfile;
  private timer?: ReturnType<typeof setTimeout>;
  private active = false;
  private choosing = false;
  private busy = false;
  private started = false;
  private error = "";
  constructor() { super("CoopScene"); }
  create() {
    this.active = true; this.choosing = false; this.busy = false; this.started = false;
    this.client = undefined; this.state = undefined; this.actorId = ""; this.error = "";
    this.cameras.main.setBackgroundColor("#050505");
    const title = createTowerWord(this, ["C", "h", "a", "r", "s", "e", "t"]).setPosition(this.scale.width / 2, 85).setScale(0.42);
    const resize = () => title.setVisible(window.innerWidth >= 600);
    window.addEventListener("resize", resize); resize();
    this.root = document.createElement("div"); this.root.className = "coop-screen";
    document.body.append(this.root); this.render();
    this.events.once("shutdown", () => {
      this.active = false; clearTimeout(this.timer); this.root?.remove(); this.root = undefined;
      window.removeEventListener("resize", resize);
    });
  }
  private capture(name: string): CoopProfile {
    return { name: name.trim() || "玩家", completed: levelNodes.filter(n => isLevelCompleted(n.id)).map(n => n.id),
      policy: copyBattlePolicy({ version: 1, slotCount: unlockedCardSlotCount(),
        allowedCards: allCardDefinitions.filter(c => isCardUnlocked(c.id)).map(c => c.id),
        reselectEnabled: isLevelCompleted(RESELECT_UNLOCK_LEVEL), pauseOnLocalModal: false }) };
  }
  private element<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text?: string) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text; parent.append(node); return node;
  }
  private button(parent: HTMLElement, text: string, action: () => void, disabled = false) {
    const button = this.element("button", parent, text); button.type = "button"; button.disabled = disabled || this.busy;
    button.onclick = () => { playUiClick(); action(); }; return button;
  }
  private render() {
    if (!this.root || this.choosing) return;
    this.root.replaceChildren();
    const main = this.element("main", this.root); main.className = "coop-content";
    const header = this.element("header", main);
    this.element("h1", header, "同场合作");
    this.button(header, this.state ? "退出房间" : "返回主菜单", () => void this.leave());
    const status = this.element("p", main, this.error); status.setAttribute("role", "status"); status.className = "coop-error";
    if (!this.state) {
      const form = this.element("form", main); form.onsubmit = e => e.preventDefault();
      const input = (label: string, value: string, id: string) => {
        const field = this.element("label", form, label); const node = this.element("input", field);
        node.value = value; node.id = id; node.autocomplete = "off"; return node;
      };
      const name = input("昵称", "玩家", "coop-name"); name.maxLength = 24;
      const address = input("服务器地址", !import.meta.env.DEV && /^https?:$/.test(location.protocol) ? location.origin :
        `http://${location.hostname || "127.0.0.1"}:5180`, "coop-address");
      const code = input("房间码", "", "coop-code"); code.maxLength = 12;
      const actions = this.element("div", form); actions.className = "coop-actions";
      const enter = (join: boolean) => {
        const values = { name: name.value, address: address.value, code: code.value.trim() };
        void this.run(async () => {
          const client = new CoopClient(coopAddress(values.address)); const profile = this.capture(values.name);
          const result = await client.request<{ token: string; actorId: string; state: CoopState }>(join ? "join" : "create", { profile, code: values.code });
          if (!this.active) return;
          client.token = result.token; this.client = client; this.profile = profile; this.actorId = result.actorId; this.state = result.state;
          this.schedulePoll();
          if (!join && this.state.levelId) {
            this.state = await client.request<CoopState>("configure", { levelId: this.state.levelId, difficulty: getSelectedDifficulty() });
          }
        });
      };
      this.button(actions, "创建房间", () => enter(false)); this.button(actions, "加入房间", () => enter(true));
      return;
    }
    const state = this.state;
    this.element("h2", main, `房间 ${state.code}`);
    const address = this.element("p", main, this.client!.address); address.className = "coop-address";
    const selection = this.element("div", main); selection.className = "coop-selection";
    const field = this.element("label", selection, "关卡");
    const levels = this.element("select", field); levels.id = "coop-level";
    if (!state.levels.length) this.element("option", levels, "尚无已通关关卡");
    for (const id of state.levels) { const option = this.element("option", levels, id); option.value = id; }
    levels.value = state.levelId; levels.disabled = this.actorId !== "host" || this.busy;
    const difficultyLabel = this.element("label", selection, "难度"); const difficulty = this.element("select", difficultyLabel); difficulty.id = "coop-difficulty";
    for (let i = DIFFICULTY_MIN; i <= DIFFICULTY_MAX; i++) { const option = this.element("option", difficulty, String(i)); option.value = String(i); }
    difficulty.value = String(state.difficulty ?? DEFAULT_DIFFICULTY); difficulty.disabled = this.actorId !== "host" || this.busy;
    const configure = () => void this.command("configure", { levelId: levels.value, difficulty: Number(difficulty.value) });
    levels.onchange = configure; difficulty.onchange = configure;
    const list = this.element("div", main); list.className = "coop-players";
    for (const id of ["host", "guest"]) {
      const player = state.players.find(p => p.id === id); const row = this.element("section", list); row.className = "coop-player";
      this.element("h3", row, `${id === "host" ? "房主" : "队友"} · ${player?.name ?? "等待加入"}${id === this.actorId ? "（你）" : ""}`);
      this.element("p", row, player?.cards.length ? player.cards.join("  ") : "未选卡");
      const ready = this.element("span", row, player?.ready ? "已准备" : "未准备"); ready.className = player?.ready ? "coop-ready" : "";
    }
    const me = state.players.find(p => p.id === this.actorId)!;
    const actions = this.element("div", main); actions.className = "coop-actions";
    this.button(actions, "选择字符", () => void this.chooseCards(), !state.levelId);
    this.button(actions, me.ready ? "取消准备" : "准备", () => void this.command("ready", { ready: !me.ready }), !me.cards.length);
    if (this.actorId === "host") this.button(actions, "开始战斗", () => void this.command("start", {}),
      state.players.length !== 2 || state.players.some(p => !p.ready));
  }
  private async run(action: () => Promise<void>) {
    if (this.busy) return; this.busy = true; this.error = "";
    this.root?.querySelectorAll("button").forEach(b => b.disabled = true);
    try { await action(); } catch (error) { this.error = error instanceof Error ? error.message : "连接失败"; }
    finally { this.busy = false; if (this.active) this.render(); }
  }
  private command(action: string, data: unknown) {
    return this.run(async () => {
      this.state = await this.client!.request<CoopState>(action, data);
      if (action === "configure" && this.actorId === "host") setSelectedDifficulty(this.state.difficulty);
    });
  }
  private schedulePoll() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), 500);
  }
  private async poll() {
    if (!this.active || !this.client) return;
    try {
      const state = await this.client.request<CoopState>("room");
      if (!this.active) return;
      const changed = JSON.stringify(state) !== JSON.stringify(this.state); this.state = state;
      if (state.phase === "closed") throw new Error(state.error ?? "房间已关闭");
      if (state.phase === "battle" && !this.started) { this.beginBattle(); return; }
      if (changed && !this.busy) this.render();
    } catch (error) { this.error = error instanceof Error ? error.message : "连接失败"; this.render(); }
    if (this.active) this.schedulePoll();
  }
  private async chooseCards() {
    await this.command("ready", { ready: false });
    if (this.error || !this.active || !this.state) return;
    this.choosing = true; this.root!.hidden = true;
    const done = (cards?: CardId[]) => {
      this.choosing = false; if (!this.active) return false;
      this.root!.hidden = false;
      if (cards) void this.command("loadout", { cards }); else this.render();
      return true;
    };
    this.scene.launch("CardSelectScene", { levelId: this.state.levelId, difficulty: this.state.difficulty,
      reselect: { selectedCards: this.state.players.find(p => p.id === this.actorId)!.cards,
        policy: this.profile!.policy, onConfirm: (cards: CardId[]) => done(cards), onCancel: () => done() } });
  }
  private beginBattle() {
    this.started = true; const client = this.client!;
    const notice = document.createElement("div"); notice.className = "coop-connection";
    const label = document.createElement("span"); notice.append(label);
    const exit = document.createElement("button"); exit.textContent = "退出联机"; notice.append(exit);
    document.body.append(notice);
    let unsubscribe = () => {};
    const remote = new RemoteBattleSession(this.game, { actorId: this.actorId, transport: client.transport(),
      onExit: () => { unsubscribe(); notice.remove(); void client.request("leave", {}).catch(() => {}); this.game.scene.start("MainMenuScene"); } });
    exit.onclick = () => remote.close();
    unsubscribe = remote.connection.subscribe(status => {
      notice.hidden = status === "ready";
      label.textContent = status === "failed" ? "连接已断开" : status === "reconnecting" ? "正在重新连接…" : "正在同步战场…";
    });
    this.scene.stop(); remote.start();
  }
  private async leave() {
    await this.run(async () => { if (this.client) await this.client.request("leave", {}).catch(() => {}); });
    this.scene.start("MainMenuScene");
  }
}
