import Phaser from "phaser";
import { BattleConnection, type BattleConnectionOptions, type BattleTransportFactory } from "../game/battleConnection";
import type { BattleSyncRestoreSnapshot } from "../game/battleSyncProtocol";
import type { BattleReceipt } from "../game/battleAuthority";
import type { BattleInputPort } from "../game/battleSyncClient";
import { GameScene } from "../scenes/GameScene";

let nextSession = 0;
export interface RemoteBattleOptions extends BattleConnectionOptions {
  actorId: string;
  transport: BattleTransportFactory;
  onExit(): void;
  receipt?(receipt: BattleReceipt): void;
}

// A connection survives snapshot-driven scene replacement; leaving the battle does not.
export class RemoteBattleSession {
  readonly connection: BattleConnection;
  private readonly input: BattleInputPort;
  private currentScene?: GameScene;
  private readonly key = `RemoteBattle-${++nextSession}`;
  private serial = 0;
  private replacing = false;
  private disposed = false;
  private readonly onGameDestroyed = () => this.close(false);

  constructor(private readonly game: Phaser.Game, private readonly options: RemoteBattleOptions) {
    this.connection = new BattleConnection({
      restore: snapshot => this.restore(snapshot),
      follow: (tick, commands) => this.requireScene().followSynchronizedFrame(tick, commands),
      checksum: () => this.requireScene().battleChecksum(),
      receipt: receipt => options.receipt?.(receipt)
    }, options.transport, options);
    const owner = this;
    this.input = {
      get ready() { return owner.connection.ready; },
      get busy() { return owner.connection.busy; },
      get status() { return owner.connection.status; },
      subscribe: listener => this.connection.subscribe(listener),
      request: (intent, completed) => {
        const requestedScene = this.currentScene;
        return this.connection.request(intent, receipt => {
          completed?.(receipt);
          // A retried receipt can belong to a retired scene. Its callbacks remain
          // fenced, but the replacement view must report its current lesson tool state.
          if (this.currentScene !== requestedScene && !(intent.type === "control" && intent.control.type === "tutorialInput")) {
            this.currentScene?.syncTutorialInput();
          }
        });
      }
    };
    game.events.once(Phaser.Core.Events.DESTROY, this.onGameDestroyed);
  }
  get scene() { return this.currentScene; }
  start() { if (!this.disposed) this.connection.start(); }
  close(notify = true) {
    if (this.disposed) return;
    this.disposed = true;
    this.connection.close();
    this.game.events.off(Phaser.Core.Events.DESTROY, this.onGameDestroyed);
    this.removeScene();
    if (notify) this.options.onExit();
  }
  private requireScene() {
    if (!this.currentScene || this.disposed) throw new Error("Remote battle scene unavailable");
    return this.currentScene;
  }
  private removeScene() {
    const scene = this.currentScene; this.currentScene = undefined;
    if (!scene) return;
    this.game.scene.stop(scene.sys.settings.key);
    this.game.scene.remove(scene.sys.settings.key);
  }
  private restore({ replay }: BattleSyncRestoreSnapshot) {
    if (this.disposed) throw new Error("Remote battle session closed");
    this.replacing = true;
    try {
      this.removeScene();
      const key = `${this.key}-${this.serial++}`;
      const scene = new GameScene(key);
      this.currentScene = scene;
      this.game.scene.add(key, scene, false);
      this.game.scene.start(key, { replica: replay, viewActorId: this.options.actorId,
        input: this.input, onRemoteExit: () => this.close() });
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (!this.replacing && !this.disposed) this.close();
      });
      scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
        if (!this.replacing && !this.disposed) {
          this.currentScene = undefined;
          this.close(false);
        }
      });
    } finally { this.replacing = false; }
  }
}
