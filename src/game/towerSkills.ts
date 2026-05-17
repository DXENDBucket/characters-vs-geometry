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
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, Tower } from "../types";
import { isBossInRect } from "./targeting";
import { getSpellMortarDamage, syncTowerHpBar } from "./towers";

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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: () => TowerSkillRuntime
  ) {}

  update(seconds: number, time: number) {
    this.updateClockTowers(seconds, time);
    this.updateSpellMortarTowers(seconds, time);
    this.updateGuardianTowers(seconds, time);
  }

  hasSpellMortarTargeting() {
    return this.spellMortarTargetingTowers.length > 0;
  }

  cardCooldownMultiplier() {
    const runtime = this.runtime();
    const activeClockLevelSum = runtime.towers
      .filter((tower) => tower.type === "c" && runtime.battleTime < tower.skillActiveUntil)
      .reduce((sum, tower) => sum + tower.level, 0);
    return activeClockLevelSum + 1;
  }

  isClockTowerReady(tower: Tower) {
    const runtime = this.runtime();
    return tower.type === "c" && runtime.battleTime >= tower.skillActiveUntil && tower.skillSp >= CLOCK_TOWER_SKILL_MAX;
  }

  activateReadyClockTowers() {
    for (const tower of this.runtime().towers) {
      if (this.isClockTowerReady(tower)) {
        this.activateClockTower(tower);
      }
    }
  }

  activateClockTower(tower: Tower) {
    tower.skillSp = 0;
    tower.skillSpBuffer = 0;
    tower.skillActiveUntil = this.runtime().battleTime + CLOCK_TOWER_SKILL_DURATION;
    tower.border.setVisible(true);
  }

  isSpellMortarReady(tower: Tower) {
    const runtime = this.runtime();
    return tower.type === "S" && runtime.battleTime >= tower.skillActiveUntil && tower.skillSp >= SPELL_MORTAR_SKILL_MAX;
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
    if (tower.type === "c") {
      resetChargeSkill(tower);
      tower.skillActiveUntil = 0;
      tower.border.setVisible(false);
      return;
    }

    if (tower.type === "S") {
      resetChargeSkill(tower);
      tower.skillActiveUntil = 0;
      tower.border.setVisible(false);
      if (this.spellMortarTargetingTowers.includes(tower)) {
        this.spellMortarTargetingTowers = this.spellMortarTargetingTowers.filter((target) => target !== tower);
        if (this.spellMortarTargetingTowers.length === 0) {
          this.destroySpellMortarReticle();
        }
      }
    }
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

  private updateClockTowers(seconds: number, time: number) {
    for (const tower of this.runtime().towers) {
      if (tower.type !== "c") {
        continue;
      }

      if (time < tower.skillActiveUntil) {
        tower.border.setVisible(true);
        tower.border.setAlpha(0.35 + Math.sin(time / 70) * 0.32 + 0.32);
        continue;
      }

      tower.border.setAlpha(1);
      if (tower.skillSp >= CLOCK_TOWER_SKILL_MAX) {
        tower.border.setVisible(true);
        continue;
      }

      tower.border.setVisible(false);
      gainTowerSp(tower, seconds, CLOCK_TOWER_SKILL_MAX);
      if (tower.skillSp >= CLOCK_TOWER_SKILL_MAX) {
        tower.border.setVisible(true);
      }
    }
  }

  private updateGuardianTowers(seconds: number, time: number) {
    for (const tower of this.runtime().towers) {
      if (tower.type !== "h") {
        continue;
      }

      if (tower.skillSp < GUARDIAN_TOWER_SKILL_MAX) {
        tower.border.setAlpha(1);
        gainTowerSp(tower, seconds, GUARDIAN_TOWER_SKILL_MAX);
      }

      if (tower.skillSp < GUARDIAN_TOWER_SKILL_MAX) {
        continue;
      }

      const targets = this.guardianHealTargets(tower);
      if (targets.length === 0) {
        tower.border.setAlpha(0.62 + Math.sin(time / 90) * 0.28);
        continue;
      }

      this.triggerGuardianSkill(tower, targets);
    }
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

  private triggerGuardianSkill(tower: Tower, targets: Tower[]) {
    tower.skillSp = Math.max(0, tower.skillSp - GUARDIAN_TOWER_SKILL_COST);
    tower.skillSpBuffer = 0;
    tower.border.setAlpha(1);

    const amount = Math.round(tower.maxHp * GUARDIAN_TOWER_HEAL_RATIO);
    for (const target of targets) {
      healTower(this.scene, target, amount);
    }
  }

  private updateSpellMortarTowers(seconds: number, time: number) {
    const runtime = this.runtime();
    this.spellMortarTargetingTowers = this.spellMortarTargetingTowers.filter((tower) => runtime.towers.includes(tower));
    if (this.spellMortarTargetingTowers.length === 0) {
      this.destroySpellMortarReticle();
    }

    for (const tower of runtime.towers) {
      if (tower.type !== "S") {
        continue;
      }

      if (time < tower.skillActiveUntil || this.spellMortarTargetingTowers.includes(tower)) {
        tower.border.setVisible(true);
        tower.border.setAlpha(0.35 + Math.sin(time / 70) * 0.32 + 0.32);
        continue;
      }

      tower.border.setAlpha(1);
      if (tower.skillSp >= SPELL_MORTAR_SKILL_MAX) {
        tower.border.setVisible(true);
        continue;
      }

      tower.border.setVisible(false);
      gainTowerSp(tower, seconds, SPELL_MORTAR_SKILL_MAX);
      if (tower.skillSp >= SPELL_MORTAR_SKILL_MAX) {
        tower.border.setVisible(true);
      }
    }
  }

  private fireSpellMortar(tower: Tower, targetX: number, targetY: number) {
    const runtime = this.runtime();
    const definition = runtime.getDefinition(tower.type);
    const damage = getSpellMortarDamage(tower, definition);
    const damageType = definition.damageType ?? "magic";
    tower.skillSp = Math.max(0, tower.skillSp - SPELL_MORTAR_SKILL_COST);
    tower.skillSpBuffer = 0;
    tower.skillActiveUntil = runtime.battleTime + (SPELL_MORTAR_SHOT_COUNT - 1) * SPELL_MORTAR_SHOT_INTERVAL;
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
}

function gainTowerSp(tower: Tower, seconds: number, maxSp: number) {
  tower.skillSpBuffer += seconds;
  while (tower.skillSpBuffer >= 1 && tower.skillSp < maxSp) {
    tower.skillSp += 1;
    tower.skillSpBuffer -= 1;
  }
  if (tower.skillSp >= maxSp) {
    tower.skillSp = maxSp;
    tower.skillSpBuffer = 0;
  }
}

function resetChargeSkill(tower: Tower) {
  tower.skillSp = 0;
  tower.skillSpBuffer = 0;
  tower.border.setAlpha(1);
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
