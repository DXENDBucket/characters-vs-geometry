import type Phaser from "phaser";

export type CardId =
  | "A"
  | "B"
  | "C"
  | "c"
  | "D"
  | "O"
  | "R"
  | "X"
  | "E"
  | "M"
  | "W"
  | "F"
  | "G"
  | "H"
  | "I"
  | "Q"
  | "J"
  | "K"
  | "L"
  | "N"
  | "T"
  | "P"
  | "Y"
  | "Z";
export type EnemyKind =
  | "circle"
  | "circle2"
  | "circle3"
  | "triangle"
  | "triangle2"
  | "triangle3"
  | "invertedTriangle"
  | "invertedTriangle2"
  | "shootingTriangle"
  | "shootingTriangle2"
  | "square"
  | "square2"
  | "square3";
export type BossKind = "cube" | "cube2" | "tetrahedron";
export type BossSkillName =
  | "promotion"
  | "advance"
  | "promotion2"
  | "charge"
  | "impact"
  | "suppression"
  | "desperation";
export type ProjectileKind = "bolt" | "shell" | "star" | "hash" | "dollar";
export type UnitCategory = "production" | "attack" | "defense" | "function" | "healing";
export type DamageType = "physical" | "magic" | "true";
export type StatusEffectName = "stasis" | "haste" | "power";
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
  projectileDebuff?: StatusEffectName;
  projectileDebuffDuration?: number;
  reflectProjectiles?: boolean;
  produceEvery?: number;
  produceAmount?: number;
  hitProduceAmount?: number;
  attackProduceAmount?: number;
  stats: string;
}

export interface StatusEffect {
  name: StatusEffectName;
  expiresAt: number;
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
  skillSp: number;
  skillSpBuffer: number;
  skillActiveUntil: number;
  autoUpgrade: boolean;
  reflectProjectiles: boolean;
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
  blockedByTowerId?: string;
  blockedSince?: number;
  statusEffects: StatusEffect[];
  statusBorder: Phaser.GameObjects.Arc;
  powerIcon: Phaser.GameObjects.Text;
  nextHasteTrailAt: number;
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
  debuff?: StatusEffectName;
  debuffDuration?: number;
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
  waveWeightIncrementGrowth?: number;
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
  hasSkills: boolean;
  skills: {
    promotion: BossSkill<"promotion">;
    advance: BossSkill<"advance">;
    promotion2?: BossSkill<"promotion2">;
    charge?: BossSkill<"charge">;
    impact?: BossSkill<"impact">;
    suppression?: BossSkill<"suppression">;
    desperation?: BossSkill<"desperation">;
  };
  contactAttackBuffer: number;
  chargeExpiresAt: number;
  halfHpTriggered: boolean;
  criticalHpTriggered: boolean;
  pendingCriticalSummon: boolean;
  invincibleUntil: number;
  bossHasteUntil: number;
  nextBossHasteTrailAt: number;
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
