import type Phaser from "phaser";

export type CardId =
  | "A"
  | "B"
  | "C"
  | "D"
  | "X"
  | "E"
  | "M"
  | "W"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "N";
export type EnemyKind =
  | "circle"
  | "circle2"
  | "circle3"
  | "triangle"
  | "triangle2"
  | "triangle3"
  | "shootingTriangle"
  | "shootingTriangle2"
  | "square"
  | "square2"
  | "square3";
export type BossKind = "cube" | "cube2";
export type BossSkillName = "promotion" | "advance" | "promotion2";
export type ProjectileKind = "bolt" | "shell" | "star" | "hash";
export type UnitCategory = "production" | "attack" | "defense" | "function" | "healing";
export type DamageType = "physical" | "magic" | "true";
export type AlphaGameObject = Phaser.GameObjects.GameObject & { setAlpha(alpha: number): unknown };

export interface DifficultyConfig {
  weightMultiplier: number;
  finalDamageReduction: number;
}

export interface CardDefinition {
  id: CardId;
  category: UnitCategory;
  cost: number;
  cooldown: number;
  maxHp: number;
  armor?: number;
  magicResistance?: number;
  fireRate?: number;
  damage?: number;
  damageType?: DamageType;
  rangeCells?: number;
  healAmount?: number;
  splashRadius?: number;
  reflectDamage?: number;
  reflectDamageType?: DamageType;
  triggerDamage?: number;
  triggerDamageType?: DamageType;
  triggerCount?: number;
  triggerInterval?: number;
  triggerRangeX?: number;
  triggerRangeY?: number;
  selfDamage?: number;
  selfDamageType?: DamageType;
  shiftCells?: number;
  armTime?: number;
  produceEvery?: number;
  produceAmount?: number;
  stats: string;
}

export interface CardState {
  definition: CardDefinition;
  frame: Phaser.GameObjects.Rectangle;
  cooldownFill: Phaser.GameObjects.Rectangle;
  content: AlphaGameObject[];
  readyAt: number;
}

export interface Tower {
  id: string;
  type: CardId;
  lane: number;
  column: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  armor: number;
  magicResistance: number;
  fireRate: number;
  lastFire: number;
  level: number;
  nextProduceAt: number;
  armedAt: number;
  autoUpgrade: boolean;
  placedOrder: number;
  body: Phaser.GameObjects.Container;
  border: Phaser.GameObjects.Graphics;
  autoUpgradeBorder: Phaser.GameObjects.Graphics;
  hpFill: Phaser.GameObjects.Rectangle;
  levelText: Phaser.GameObjects.Text;
}

export interface Enemy {
  kind: EnemyKind;
  waveNumber: number;
  weight: number;
  lane: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  magicResistance: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  finalDamageReduction: number;
  attackInterval: number;
  attackAt: number;
  body: Phaser.GameObjects.Container;
  shape: Phaser.GameObjects.GameObject & { setScale(scale: number): unknown };
}

export interface Projectile {
  type: ProjectileKind;
  lane: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  damageType: DamageType;
  splashRadius: number;
  maxX: number;
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
}

export interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  damage: number;
  damageType: DamageType;
  sourceLane: number;
  body: Phaser.GameObjects.Rectangle;
}

export interface EnemyDefinition {
  kind: EnemyKind;
  label?: string;
  hp: number;
  armor: number;
  magicResistance: number;
  damage: number;
  damageType: DamageType;
  speedMultiplier?: number;
  weight: number;
}

export interface WaveTracker {
  number: number;
  totalWeight: number;
  defeatedWeight: number;
  spawnedAt: number;
}

export interface LevelNode {
  id: string;
  x: number;
  y: number;
  unlocked: boolean;
}

export interface LevelConfig {
  id: string;
  enemyKinds: EnemyKind[];
  firstWaveWeight: number;
  waveWeightIncrement: number;
  totalWaves?: number;
  wavesPerFlag: number;
  waveWeightCap?: number;
  startingChars?: number;
  bossKind?: BossKind;
  endless?: boolean;
}

export interface BossSkill<Name extends BossSkillName = BossSkillName> {
  name: Name;
  sp: number;
  maxSp: number;
  cost: number;
  gainBuffer: number;
}

export interface CubeBoss {
  kind: BossKind;
  rank: number;
  label: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  magicResistance: number;
  finalDamageReduction: number;
  speed: number;
  advanceMinionKind: EnemyKind;
  skills: {
    promotion: BossSkill<"promotion">;
    advance: BossSkill<"advance">;
    promotion2?: BossSkill<"promotion2">;
  };
  contactAttackBuffer: number;
  body: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  labelText: Phaser.GameObjects.Text;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  targetVelocityX: number;
  targetVelocityY: number;
  targetVelocityZ: number;
  nextTurnIn: number;
}
