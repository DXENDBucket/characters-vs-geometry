import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_Y, CARD_HEIGHT, CARD_WIDTH, palette } from "../config";
import type { CardId, CardView } from "../types";
import type { BattleCardState } from "../game/battleLoadout";
import { createCardViews, destroyCardViews } from "./gameUi";

export class BattleCardList {
  readonly cards: CardView[];
  private readonly viewport = new Phaser.Geom.Rectangle(24, 118, 184, BOARD_Y + BOARD_HEIGHT + 4 - 118);
  private readonly container: Phaser.GameObjects.Container;
  private readonly maskGraphics: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.Display.Masks.GeometryMask;
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly thumb: Phaser.GameObjects.Rectangle;
  private readonly maxOffset: number;
  private offset = 0;
  private drag?: { pointer: Phaser.Input.Pointer; y: number; offset: number; card?: CardView; moved: boolean; scrollbar: boolean };

  constructor(
    private readonly scene: Phaser.Scene,
    states: readonly BattleCardState[],
    private readonly onSelect: (id: CardId) => void,
    private readonly canInteract: () => boolean
  ) {
    this.cards = createCardViews(scene, states);
    this.container = scene.add.container(0, 0).setDepth(30);
    for (const card of this.cards) {
      this.container.add([card.frame, ...card.content, card.cooldownFill]);
    }
    this.maskGraphics = scene.add.graphics().setVisible(false);
    this.maskGraphics.fillStyle(0xffffff).fillRect(this.viewport.x, this.viewport.y, 174, this.viewport.height);
    this.mask = this.maskGraphics.createGeometryMask();
    this.container.setMask(this.mask);
    const contentBottom = this.cards.at(-1)?.frame.y ?? this.viewport.y;
    this.maxOffset = Math.max(0, contentBottom + CARD_HEIGHT + 4 - this.viewport.bottom);
    this.track = scene.add.rectangle(203, this.viewport.y, 3, this.viewport.height, palette.dim, 0.55)
      .setOrigin(0.5, 0).setDepth(31).setVisible(this.maxOffset > 0);
    const thumbHeight = this.viewport.height * this.viewport.height / (this.viewport.height + this.maxOffset);
    this.thumb = scene.add.rectangle(203, this.viewport.y, 4, thumbHeight, palette.mid, 0.9)
      .setOrigin(0.5, 0).setDepth(31).setVisible(this.maxOffset > 0);
    this.layout();
    scene.input.on("wheel", this.onWheel);
    scene.input.on("pointerdown", this.onDown);
    scene.input.on("pointermove", this.onMove);
    scene.input.on("pointerup", this.onUp);
    scene.input.on("pointerupoutside", this.onUpOutside);
  }

  ensureVisible(id: CardId) {
    const card = this.cards.find(card => card.state.definition.id === id);
    if (!card) return;
    const top = card.frame.y - this.offset - 4;
    const bottom = card.frame.y - this.offset + CARD_HEIGHT + 4;
    if (top < this.viewport.top) this.setOffset(this.offset + top - this.viewport.top);
    else if (bottom > this.viewport.bottom) this.setOffset(this.offset + bottom - this.viewport.bottom);
  }

  destroy() {
    this.scene.input.off("wheel", this.onWheel);
    this.scene.input.off("pointerdown", this.onDown);
    this.scene.input.off("pointermove", this.onMove);
    this.scene.input.off("pointerup", this.onUp);
    this.scene.input.off("pointerupoutside", this.onUpOutside);
    this.drag = undefined;
    destroyCardViews(this.cards);
    this.container.clearMask();
    this.container.destroy();
    this.mask.destroy();
    this.maskGraphics.destroy();
    this.track.destroy();
    this.thumb.destroy();
  }

  private readonly onWheel = (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
    if (this.canInteract() && this.viewport.contains(pointer.x, pointer.y) && this.maxOffset > 0) {
      if (this.drag) this.drag.moved = true;
      this.setOffset(this.offset + dy);
    }
  };

  private readonly onDown = (pointer: Phaser.Input.Pointer) => {
    if (!this.canInteract() || !pointer.leftButtonDown() || !this.viewport.contains(pointer.x, pointer.y)) return;
    const scrollbar = this.maxOffset > 0 && pointer.x >= 198;
    this.drag = { pointer, y: pointer.y, offset: this.offset, card: this.cardAt(pointer), moved: scrollbar, scrollbar };
    if (scrollbar && (pointer.y < this.thumb.y || pointer.y > this.thumb.y + this.thumb.height)) {
      this.setOffset((pointer.y - this.viewport.y - this.thumb.height / 2) / this.thumbTravel() * this.maxOffset);
      this.drag.offset = this.offset;
    }
  };

  private readonly onMove = (pointer: Phaser.Input.Pointer) => {
    const drag = this.drag;
    if (!drag || drag.pointer !== pointer) return;
    if (!this.canInteract() || !pointer.isDown) { this.drag = undefined; return; }
    const delta = pointer.y - drag.y;
    if (Math.abs(delta) >= 6) drag.moved = true;
    if (!drag.moved || this.maxOffset <= 0) return;
    this.setOffset(drag.offset + (drag.scrollbar ? delta * this.maxOffset / this.thumbTravel() : -delta));
  };

  private readonly onUp = (pointer: Phaser.Input.Pointer) => {
    const drag = this.drag;
    if (!drag || drag.pointer !== pointer) return;
    this.drag = undefined;
    if (!this.canInteract() || drag.moved || drag.scrollbar || !this.viewport.contains(pointer.x, pointer.y)) return;
    if (drag.card && this.cardAt(pointer) === drag.card) {
      this.onSelect(drag.card.state.definition.id);
    }
  };

  private readonly onUpOutside = () => { this.drag = undefined; };

  private cardAt(pointer: Phaser.Input.Pointer) {
    return this.cards.find(card => pointer.x >= card.frame.x && pointer.x <= card.frame.x + CARD_WIDTH &&
      pointer.y >= card.frame.y - this.offset && pointer.y <= card.frame.y - this.offset + CARD_HEIGHT);
  }

  private setOffset(offset: number) {
    const next = Math.round(Phaser.Math.Clamp(offset, 0, this.maxOffset));
    if (next === this.offset) return;
    this.offset = next;
    this.layout();
  }

  private thumbTravel() {
    return Math.max(1, this.viewport.height - this.thumb.height);
  }

  private layout() {
    this.container.y = -this.offset;
    this.thumb.y = this.viewport.y + (this.maxOffset > 0 ? this.offset / this.maxOffset * this.thumbTravel() : 0);
    for (const card of this.cards) {
      if (!card.frame.input) continue;
      const y = card.frame.y - this.offset;
      const clipTop = Math.max(0, this.viewport.top - y);
      const clipBottom = Math.min(CARD_HEIGHT, this.viewport.bottom - y);
      card.frame.input.enabled = clipBottom > clipTop;
      (card.frame.input.hitArea as Phaser.Geom.Rectangle).setTo(0, clipTop, CARD_WIDTH, Math.max(0, clipBottom - clipTop));
    }
  }
}
