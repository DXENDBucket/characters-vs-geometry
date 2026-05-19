import Phaser from "phaser";
import {
  CELL_WIDTH,
  CLOCK_TOWER_SKILL_DURATION,
  CLOCK_TOWER_SKILL_MAX,
  GUARDIAN_TOWER_HEAL_RATIO,
  GUARDIAN_TOWER_SKILL_COST,
  GUARDIAN_TOWER_SKILL_MAX,
  SPELL_MORTAR_AOE_RANGE_X,
  SPELL_MORTAR_AOE_RANGE_Y,
  SPELL_MORTAR_SHOT_COUNT,
  SPELL_MORTAR_SHOT_INTERVAL,
  SPELL_MORTAR_SKILL_COST,
  SPELL_MORTAR_SKILL_MAX,
  palette
} from "../config";
import { makeHealParticles, makeSpellMortarImpact, makeSpellMortarShot } from "../render/combatEffects";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, SkillState, Tower } from "../types";
import { updateRegisteredSkills } from "./skillRegistry";
import { gainSkillSp, getTowerSkillState, resetSkillCharge } from "./skillState";
import { createTowerSkillRegistry, type TowerSkillDefinition } from "./towerSkillRegistry";
import { isBossInRect } from "./targeting";
import { effectiveTowerLevel, getSpellMortarDamage, syncTowerHpBar } from "./towers";

export interface TowerSkillRuntime {
  towers: Tower[];
  enemies: Enemy[];
  boss: CubeBoss | null;
  battleTime: number;
  gameOver: boolean;
  battlePaused: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType) => void;
  damageBoss: (damage: number, damageType: DamageType) => void;
  runWhenBattleActive: (action: () => void) => void;
  onTargetingChanged: () => void;
}

export class TowerSkillController {
  private spellMortarTargetingTowers: Tower[] = [];
  private spellMortarReticle: Phaser.GameObjects.Container | null = null;
  private activeSpellMortarTweens: Phaser.Tweens.Tween[] = [];
  private readonly skillDefinitions: Partial<Record<CardId, TowerSkillDefinition>>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: () => TowerSkillRuntime
  ) {
    this.skillDefinitions = createTowerSkillRegistry({
      updateClockTower: (tower, state, seconds, time) => this.updateClockTower(tower, state, seconds, time),
      resetClockTower: (tower, state) => this.resetClockTower(tower, state),
      updateGuardianTower: (tower, state, seconds, time) => this.updateGuardianTower(tower, state, seconds, time),
      updateSpellMortarTower: (tower, state, seconds, time) => this.updateSpellMortarTower(tower, state, seconds, time),
      resetSpellMortarTower: (tower, state) => this.resetSpellMortarTower(tower, state)
    });
  }

  update(seconds: number, time: number) {
    this.syncSpellMortarTargetingTowers();
    updateRegisteredSkills(
      this.runtime().towers,
      (tower) => {
        const definition = this.skillDefinitions[tower.type];
        return definition ? [definition] : [];
      },
      undefined,
      seconds,
      time
    );
  }

  hasSpellMortarTargeting() {
    return this.spellMortarTargetingTowers.length > 0;
  }

  cardCooldownMultiplier() {
    const runtime = this.runtime();
    const activeClockLevelSum = runtime.towers
      .filter((tower) => tower.type === "c" && runtime.battleTime < getTowerSkillState(tower, "clock").activeUntil)
      .reduce((sum, tower) => sum + effectiveTowerLevel(tower), 0);
    return activeClockLevelSum + 1;
  }

  isClockTowerReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "clock");
    return tower.type === "c" && runtime.battleTime >= state.activeUntil && state.sp >= CLOCK_TOWER_SKILL_MAX;
  }

  activateReadyClockTowers() {
    for (const tower of this.runtime().towers) {
      if (this.isClockTowerReady(tower)) {
        this.activateClockTower(tower);
      }
    }
  }

  activateClockTower(tower: Tower) {
    const state = getTowerSkillState(tower, "clock");
    resetSkillCharge(state);
    state.activeUntil = this.runtime().battleTime + CLOCK_TOWER_SKILL_DURATION;
    tower.border.setVisible(true);
  }

  isSpellMortarReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "spellMortar");
    return tower.type === "S" && runtime.battleTime >= state.activeUntil && state.sp >= SPELL_MORTAR_SKILL_MAX;
  }

  activateReadySpellMortars(x: number, y: number) {
    const towers = this.runtime().towers.filter((tower) => this.isSpellMortarReady(tower));
    this.activateSpellMortarTargeting(towers, x, y);
  }

  activateSpellMortarTargeting(towers: Tower[], x: number, y: number) {
    const readyTowers = towers.filter((tower) => this.isSpellMortarReady(tower));
    if (readyTowers.length === 0) {
      return;
    }

    this.spellMortarTargetingTowers = readyTowers;
    this.ensureSpellMortarReticle();
    this.updateSpellMortarReticlePosition(x, y);
  }

  cancelSpellMortarTargeting() {
    if (this.spellMortarTargetingTowers.length === 0) {
      return;
    }

    this.spellMortarTargetingTowers = [];
    this.destroySpellMortarReticle();
    this.runtime().onTargetingChanged();
  }

  fireSelectedSpellMortars(targetX: number, targetY: number) {
    const towers = this.spellMortarTargetingTowers.filter((tower) => this.isSpellMortarReady(tower));
    if (towers.length === 0) {
      this.cancelSpellMortarTargeting();
      return;
    }

    this.spellMortarTargetingTowers = [];
    this.destroySpellMortarReticle();
    for (const tower of towers) {
      this.fireSpellMortar(tower, targetX, targetY);
    }
    this.runtime().onTargetingChanged();
  }

  updateSpellMortarReticlePosition(x: number, y: number) {
    if (!this.spellMortarReticle) {
      return;
    }

    this.spellMortarReticle.setPosition(Math.round(x), Math.round(y));
  }

  resetTowerSkill(tower: Tower) {
    const definition = this.skillDefinitions[tower.type];
    if (!definition?.reset) {
      return;
    }
    definition.reset(tower, getTowerSkillState(tower, definition.stateKey), undefined);
  }

  syncSpellMortarTweenPause(paused: boolean) {
    for (const tween of this.activeSpellMortarTweens) {
      if (paused) {
        tween.pause();
      } else {
        tween.resume();
      }
    }
  }

  private updateClockTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil) {
      tower.border.setVisible(true);
      tower.border.setAlpha(0.35 + Math.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    tower.border.setAlpha(1);
    if (state.sp >= CLOCK_TOWER_SKILL_MAX) {
      tower.border.setVisible(true);
      return;
    }

    tower.border.setVisible(false);
    gainSkillSp(state, seconds, CLOCK_TOWER_SKILL_MAX);
    if (state.sp >= CLOCK_TOWER_SKILL_MAX) {
      tower.border.setVisible(true);
    }
  }

  private updateGuardianTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (state.sp < GUARDIAN_TOWER_SKILL_MAX) {
      tower.border.setAlpha(1);
      gainSkillSp(state, seconds, GUARDIAN_TOWER_SKILL_MAX);
    }

    if (state.sp < GUARDIAN_TOWER_SKILL_MAX) {
      return;
    }

    const targets = this.guardianHealTargets(tower);
    if (targets.length === 0) {
      tower.border.setAlpha(0.62 + Math.sin(time / 90) * 0.28);
      return;
    }

    this.triggerGuardianSkill(tower, state, targets);
  }

  private guardianHealTargets(tower: Tower) {
    const targets: Tower[] = [];
    if (tower.hp < tower.maxHp) {
      targets.push(tower);
    }

    const ally = this.runtime()
      .towers.filter((candidate) => {
        return (
          candidate !== tower &&
          candidate.hp < candidate.maxHp &&
          Math.abs(candidate.lane - tower.lane) <= 1 &&
          Math.abs(candidate.column - tower.column) <= 1
        );
      })
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.placedOrder - b.placedOrder)[0];

    if (ally) {
      targets.push(ally);
    }
    return targets;
  }

  private triggerGuardianSkill(tower: Tower, state: SkillState, targets: Tower[]) {
    state.sp = Math.max(0, state.sp - GUARDIAN_TOWER_SKILL_COST);
    state.spBuffer = 0;
    tower.border.setAlpha(1);

    const amount = Math.round(tower.maxHp * GUARDIAN_TOWER_HEAL_RATIO);
    for (const target of targets) {
      healTower(this.scene, target, amount);
    }
  }

  private syncSpellMortarTargetingTowers() {
    const runtime = this.runtime();
    this.spellMortarTargetingTowers = this.spellMortarTargetingTowers.filter((tower) => runtime.towers.includes(tower));
    if (this.spellMortarTargetingTowers.length === 0) {
      this.destroySpellMortarReticle();
    }
  }

  private updateSpellMortarTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil || this.spellMortarTargetingTowers.includes(tower)) {
      tower.border.setVisible(true);
      tower.border.setAlpha(0.35 + Math.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    tower.border.setAlpha(1);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      tower.border.setVisible(true);
      return;
    }

    tower.border.setVisible(false);
    gainSkillSp(state, seconds, SPELL_MORTAR_SKILL_MAX);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      tower.border.setVisible(true);
    }
  }

  private fireSpellMortar(tower: Tower, targetX: number, targetY: number) {
    const runtime = this.runtime();
    const definition = runtime.getDefinition(tower.type);
    const damage = getSpellMortarDamage(tower, definition);
    const damageType = definition.damageType ?? "magic";
    const state = getTowerSkillState(tower, "spellMortar");
    state.sp = Math.max(0, state.sp - SPELL_MORTAR_SKILL_COST);
    state.spBuffer = 0;
    state.activeUntil = runtime.battleTime + (SPELL_MORTAR_SHOT_COUNT - 1) * SPELL_MORTAR_SHOT_INTERVAL;
    tower.border.setVisible(true);

    for (let shotIndex = 0; shotIndex < SPELL_MORTAR_SHOT_COUNT; shotIndex += 1) {
      this.scene.time.delayedCall(shotIndex * SPELL_MORTAR_SHOT_INTERVAL, () => {
        this.runtime().runWhenBattleActive(() => {
          const latest = this.runtime();
          if (latest.gameOver || !latest.towers.includes(tower)) {
            return;
          }

          let tween: Phaser.Tweens.Tween;
          tween = makeSpellMortarShot(
            this.scene,
            tower.x,
            tower.y,
            targetX,
            targetY,
            () => {
              this.detonateSpellMortar(targetX, targetY, damage, damageType);
            },
            () => {
              Phaser.Utils.Array.Remove(this.activeSpellMortarTweens, tween);
            }
          );
          this.activeSpellMortarTweens.push(tween);
          if (latest.battlePaused) {
            tween.pause();
          }
        });
      });
    }
  }

  private detonateSpellMortar(x: number, y: number, damage: number, damageType: DamageType) {
    const runtime = this.runtime();
    if (runtime.gameOver) {
      return;
    }

    makeSpellMortarImpact(this.scene, x, y, SPELL_MORTAR_AOE_RANGE_X, SPELL_MORTAR_AOE_RANGE_Y);
    for (const enemy of [...runtime.enemies]) {
      if (Math.abs(enemy.x - x) <= SPELL_MORTAR_AOE_RANGE_X && Math.abs(enemy.y - y) <= SPELL_MORTAR_AOE_RANGE_Y) {
        runtime.damageEnemy(enemy, damage, damageType);
      }
    }
    if (isBossInRect(runtime.boss, x - SPELL_MORTAR_AOE_RANGE_X, y - SPELL_MORTAR_AOE_RANGE_Y, SPELL_MORTAR_AOE_RANGE_X * 2, SPELL_MORTAR_AOE_RANGE_Y * 2)) {
      runtime.damageBoss(damage, damageType);
    }
  }

  private ensureSpellMortarReticle() {
    if (this.spellMortarReticle) {
      return;
    }

    const size = CELL_WIDTH * 0.75;
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(2, palette.magic, 0.9);
    graphics.strokeRect(-size / 2, -size / 2, size, size);
    graphics.lineBetween(-size / 2, 0, -size / 5, 0);
    graphics.lineBetween(size / 5, 0, size / 2, 0);
    graphics.lineBetween(0, -size / 2, 0, -size / 5);
    graphics.lineBetween(0, size / 5, 0, size / 2);
    const label = this.scene.add
      .text(0, -1, "S", {
        color: "#9fdcff",
        fontFamily: "monospace",
        fontSize: "22px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    this.spellMortarReticle = this.scene.add.container(0, 0, [graphics, label]).setDepth(160);
  }

  private destroySpellMortarReticle() {
    this.spellMortarReticle?.destroy();
    this.spellMortarReticle = null;
  }

  private resetClockTower(tower: Tower, state: SkillState) {
    resetSkillCharge(state);
    state.activeUntil = 0;
    tower.border.setVisible(false);
    tower.border.setAlpha(1);
  }

  private resetSpellMortarTower(tower: Tower, state: SkillState) {
    resetSkillCharge(state);
    state.activeUntil = 0;
    tower.border.setVisible(false);
    tower.border.setAlpha(1);
    if (this.spellMortarTargetingTowers.includes(tower)) {
      this.spellMortarTargetingTowers = this.spellMortarTargetingTowers.filter((target) => target !== tower);
      if (this.spellMortarTargetingTowers.length === 0) {
        this.destroySpellMortarReticle();
      }
    }
  }
}

function healTower(scene: Phaser.Scene, tower: Tower, amount: number) {
  const previousHp = tower.hp;
  tower.hp = Math.min(tower.maxHp, tower.hp + amount);
  if (tower.hp <= previousHp) {
    return;
  }

  syncTowerHpBar(tower);
  makeHealParticles(scene, tower.x, tower.y);
}
