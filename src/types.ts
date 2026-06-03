import type Phaser from "phaser";

export type CardId =
  | "A"
  | "a"
  | "B"
  | "b"
  | "C"
  | "c"
  | "D"
  | "d"
  | "e"
  | "O"
  | "R"
  | "X"
  | "x"
  | "E"
  | "M"
  | "m"
  | "W"
  | "w"
  | "F"
  | "f"
  | "G"
  | "H"
  | "h"
  | "I"
  | "i"
  | "Q"
  | "J"
  | "K"
  | "k"
  | "S"
  | "s"
  | "L"
  | "l"
  | "N"
  | "n"
  | "T"
  | "t"
  | "U"
  | "V"
  | "v"
  | "P"
  | "p"
  | "Y"
  | "Z";
export type EnemyKind =
  | "circle"
  | "circle2"
  | "circle3"
  | "triangle"
  | "triangle2"
  | "triangle3"
  | "triangleRam"
  | "triangleRam2"
  | "triangleRam3"
  | "angelPentagonRam"
  | "mortarTriangle"
  | "mortarTriangle2"
  | "mortarTriangle3"
  | "pentagon"
  | "angelPentagon"
  | "angelPentagon2"
  | "archangelHeptagon"
  | "archangelHeptagon2"
  | "shootingPentagon"
  | "diamond"
  | "diamond2"
  | "hexagon"
  | "hexagon2"
  | "chargingHexagon"
  | "chargingHexagon2"
  | "hexMace"
  | "hexMace2"
  | "hexSpellBulwark"
  | "hexSpellBulwark2"
  | "heart"
  | "heart2"
  | "burrowArrow"
  | "burrowArrow2"
  | "slopeTriangle"
  | "invertedTriangle"
  | "invertedTriangle2"
  | "invertedTriangle3"
  | "shootingTriangle"
  | "shootingTriangle2"
  | "shootingTriangle3"
  | "dodecahedronCompanion"
  | "trapezoid"
  | "trapezoid2"
  | "trapezoid3"
  | "solarBomb"
  | "square"
  | "square2"
  | "square3";
export type BossKind =
  | "cube"
  | "cube2"
  | "tetrahedron"
  | "tetrahedron2"
  | "dodecahedron"
  | "smallStellatedDodecahedron"
  | "octahedron";
export type BossSkillName =
  | "promotion"
  | "advance"
  | "promotion2"
  | "charge"
  | "impact"
  | "suppression"
  | "desperation"
  | "endlessWings";
export type ProjectileKind = "bolt" | "shell" | "star" | "hash" | "dollar" | "chevron";
export type UnitCategory = "production" | "attack" | "defense" | "function" | "healing";
export type DamageType = "physical" | "magic" | "true";
export type StatusEffectName =
  | "stasis"
  | "haste"
  | "power"
  | "flying"
  | "invincible"
  | "highFlying"
  | "sunder"
  | "frozen";
export type BossCompanionActionPhase = "laser" | "mortar" | "wings";
export type AlphaGameObject = Phaser.GameObjects.GameObject & { setAlpha(alpha: number): unknown };

export interface DifficultyConfig {
  weightMultiplier: number;
  finalDamageReduction: number;
}

export interface TowerBaseStats {
  maxHp: number;
  armor: number;
  magicResistance: number;
  attackSpeed?: number;
  damage?: number;
  damageType?: DamageType;
}

export interface TowerFinalStats extends TowerBaseStats {}

export interface EnemyBaseStats {
  maxHp: number;
  armor: number;
  magicResistance: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  finalDamageReduction: number;
  attackSpeed: number;
  attackInterval: number;
}

export interface EnemyFinalStats extends EnemyBaseStats {}

export interface BossBaseStats {
  maxHp: number;
  armor: number;
  magicResistance: number;
  speed: number;
  finalDamageReduction: number;
}

export interface BossFinalStats extends BossBaseStats {}

export interface CardDefinition {
  id: CardId;
  category: UnitCategory;
  cost: number;
  cooldown: number;
  maxHp: number;
  armor?: number;
  magicResistance?: number;
  attackSpeed?: number;
  damage?: number;
  damageType?: DamageType;
  rangeCells?: number;
  healAmount?: number;
  healTargets?: number;
  splashRadius?: number;
  reflectDamage?: number;
  reflectDamageType?: DamageType;
  triggerDamage?: number;
  triggerDamageType?: DamageType;
  triggerCount?: number;
  triggerInterval?: number;
  triggerRangeX?: number;
  triggerRangeY?: number;
  triggerShape?: "rect" | "circle";
  triggerDebuff?: StatusEffectName;
  triggerDebuffDuration?: number;
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
  mortarTargeting?: "lowestMaxHp" | "first";
  mortarSingleTarget?: boolean;
  mortarAoeFalloff?: boolean;
  mortarHitRadius?: number;
  mortarMarkerText?: string;
  stats: string;
}

export interface StatusEffect {
  name: StatusEffectName;
  expiresAt: number;
  speedMultiplier?: number;
  showHalo?: boolean;
  physicalDamageTaken?: number;
}

export interface SkillState {
  sp: number;
  spBuffer: number;
  activeUntil: number;
  regenMultiplier?: number;
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
  baseStats: TowerBaseStats;
  finalStats: TowerFinalStats;
  maxHp: number;
  baseMaxHp: number;
  armor: number;
  magicResistance: number;
  attackSpeed?: number;
  lastFire: number;
  level: number;
  levelBonus: number;
  mirrorLevelBonus: number;
  mirrorGroupId?: number;
  nextProduceAt: number;
  armedAt: number;
  skills: Record<string, SkillState>;
  autoUpgrade: boolean;
  reflectProjectiles: boolean;
  nextRepelDirection: -1 | 1;
  facingDirection: -1 | 1;
  transient: boolean;
  turnTargetId?: string;
  placedOrder: number;
  body: Phaser.GameObjects.Container;
  border: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  facingIcon: Phaser.GameObjects.Text;
  autoUpgradeBorder: Phaser.GameObjects.Graphics;
  trueDamageBorder: Phaser.GameObjects.Graphics;
  flyingHalo: Phaser.GameObjects.Ellipse;
  hpFill: Phaser.GameObjects.Rectangle;
  levelText: Phaser.GameObjects.Text;
  trueDamageUntil: number;
  flyingUntil: number;
}

export interface Enemy {
  kind: EnemyKind;
  waveNumber: number;
  weight: number;
  lane: number;
  spawnX: number;
  x: number;
  y: number;
  hp: number;
  baseStats: EnemyBaseStats;
  finalStats: EnemyFinalStats;
  maxHp: number;
  armor: number;
  magicResistance: number;
  speed: number;
  movementDirection?: -1 | 1;
  maceVelocity?: number;
  maceFacingDirection?: -1 | 1;
  solarBombVelocityX?: number;
  solarBombVelocityY?: number;
  solarBombDepleted?: boolean;
  solarBombLastCollisionAt?: number;
  burrowAt?: number;
  burrowed?: boolean;
  burrowUnloaded?: boolean;
  burrowCargo?: Enemy[];
  slopeFacingDirection?: -1 | 1;
  highFlightStartedAt?: number;
  highFlightUntil?: number;
  highFlightStartX?: number;
  highFlightStartY?: number;
  highFlightTargetX?: number;
  highFlightTargetY?: number;
  highFlightPeakHeight?: number;
  damage: number;
  damageType: DamageType;
  finalDamageReduction: number;
  attackSpeed: number;
  attackInterval: number;
  attackAt: number;
  blockedByTowerId?: string;
  blockedSince?: number;
  angelRamWingsTriggered?: boolean;
  skills: Record<string, SkillState>;
  statusEffects: StatusEffect[];
  statusBorder: Phaser.GameObjects.Arc;
  frozenBorder: Phaser.GameObjects.Rectangle;
  powerIcon: Phaser.GameObjects.Text;
  sunderIcon: Phaser.GameObjects.Text;
  armorIcon: Phaser.GameObjects.Text;
  magicResistanceIcon: Phaser.GameObjects.Text;
  flyingHalo: Phaser.GameObjects.Ellipse;
  nextHasteTrailAt: number;
  body: Phaser.GameObjects.Container;
  shape: Phaser.GameObjects.GameObject & { setScale(scale: number): unknown };
  bossOrbitAngle?: number;
  bossOrbitRadius?: number;
  bossCompanionIndex?: number;
  bossCompanionNextActionAt?: number;
  bossCompanionActionPhase?: BossCompanionActionPhase;
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
  limitDirection: -1 | 1;
  targetEnemy?: Enemy;
  sourceTower?: Tower;
  speed?: number;
  acceleration?: number;
  maxSpeed?: number;
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
}

export interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  damage: number;
  damageType: DamageType;
  sourceLane: number;
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
}

export interface MortarProjectile {
  owner: "enemy" | "tower";
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  progress: number;
  duration: number;
  damage: number;
  damageType: DamageType;
  rangeX: number;
  rangeY: number;
  marker?: "shell" | "text";
  markerText?: string;
  markerTextColor?: string;
  sourceEnemy?: Enemy;
  sourceTower?: Tower;
  targetEnemy?: Enemy;
  targetTower?: Tower;
  singleTarget?: boolean;
  hitRadius?: number;
  radialFalloff?: boolean;
  debuff?: StatusEffectName;
  debuffDuration?: number;
  shiftSelfDamageApplied?: boolean;
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
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
  minFlag?: number;
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

export interface BossSkill<Name extends BossSkillName = BossSkillName> extends SkillState {
  name: Name;
  maxSp: number;
  cost: number;
}

export interface CubeBoss {
  kind: BossKind;
  rank: number;
  label: string;
  x: number;
  y: number;
  hp: number;
  baseStats: BossBaseStats;
  finalStats: BossFinalStats;
  maxHp: number;
  armor: number;
  magicResistance: number;
  finalDamageReduction: number;
  speed: number;
  movementAxis?: "x" | "y";
  movementDirection?: -1 | 1;
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
    endlessWings?: BossSkill<"endlessWings">;
  };
  contactAttackBuffer: number;
  chargeExpiresAt: number;
  halfHpTriggered: boolean;
  criticalHpTriggered: boolean;
  pendingCriticalSummon: boolean;
  companionsInitialized: boolean;
  companionArmorReduced: boolean;
  companionDeathsHandled: number;
  invincibleUntil: number;
  bossHasteUntil: number;
  nextBossHasteTrailAt: number;
  octahedronCopies?: CubeBoss[];
  octahedronSolarBombsInitialized?: boolean;
  octahedronSpawn75Triggered?: boolean;
  octahedronSpawn50Triggered?: boolean;
  octahedronSpawn25Triggered?: boolean;
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
