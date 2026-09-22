import type Phaser from "phaser";
import type { TowerActionEvent } from "./game/towerActions";
import type { ProjectileIntegrity } from "./game/projectileIntegrity";

export type CardId =
  | "?"
  | `?${string}`
  | "()"
  | "!"
  | "+"
  | "-"
  | "&"
  | "="
  | "1"
  | "0"
  | "@"
  | "#"
  | "A"
  | "a"
  | "B"
  | "b"
  | "C"
  | "c"
  | "D"
  | "d"
  | "e"
  | "g"
  | "O"
  | "o"
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
  | "q"
  | "J"
  | "j"
  | "K"
  | "k"
  | "S"
  | "s"
  | "L"
  | "l"
  | "r"
  | "N"
  | "n"
  | "T"
  | "t"
  | "U"
  | "u"
  | "V"
  | "v"
  | "P"
  | "p"
  | "Y"
  | "y"
  | "z"
  | "Z";
export type EnemyFamily =
  | "dollar"
  | "equals"
  | "parentheses"
  | "tilde"
  | "circle"
  | "triangle"
  | "triangleRam"
  | "angelPentagonRam"
  | "mortarTriangle"
  | "pentagon"
  | "angelPentagon"
  | "archangelHeptagon"
  | "shootingPentagon"
  | "diamond"
  | "hexagon"
  | "chargingHexagon"
  | "hexMace"
  | "hexSpellBulwark"
  | "heart"
  | "burrowArrow"
  | "slopeTriangle"
  | "invertedTriangle"
  | "shootingTriangle"
  | "dodecahedronCompanion"
  | "trapezoid"
  | "solarBomb"
  | "square";
export type RankedEnemyFamily = Exclude<EnemyFamily, "solarBomb">;
export type EnemyKind = EnemyFamily | `${RankedEnemyFamily}${number}`;
export type BossKind =
  | "cube"
  | "cube2"
  | "tetrahedron"
  | "tetrahedron2"
  | "dodecahedron"
  | "dodecahedron2"
  | "smallStellatedDodecahedron"
  | "octahedron"
  | "octahedron2"
  | "icosahedron";
export type BossSkillName =
  | "promotion"
  | "advance"
  | "charge"
  | "impact"
  | "suppression"
  | "desperation"
  | "endlessWings"
  | "ultimateAdvance"
  | "heartbeatAlpha"
  | "heartbeatBeta"
  | "leap";
export type ProjectileKind = "bolt" | "shell" | "star" | "hash" | "dollar" | "chevron";
export type UnitCategory = "production" | "attack" | "defense" | "function" | "healing" | "special";
export type DamageType = "physical" | "magic" | "true";
export type StatusEffectName =
  | "stasis"
  | "haste"
  | "power"
  | "flying"
  | "invincible"
  | "highFlying"
  | "sunder"
  | "frozen"
  | "reversed";
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
  attackPower: number;
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
  attackPower: number;
  attackMultiplier?: number;
  damageType?: DamageType;
  rangeCells?: number;
  healTargets?: number;
  splashRadius?: number;
  reflectAttackMultiplier?: number;
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
  skillDrainOnHit?: number;
  reflectProjectiles?: boolean;
  produceEvery?: number;
  produceAmount?: number;
  hitProduceAmount?: number;
  attackProduceAmount?: number;
  mortarTargeting?: "rangedHighestAttack" | "first";
  mortarSingleTarget?: boolean;
  mortarAoeFalloff?: boolean;
  mortarHitRadius?: number;
  mortarMarkerText?: string;
  stats: string;
}

export interface StatusEffect {
  name: StatusEffectName;
  source?: "movementAura";
  expiresAt: number;
  speedMultiplier?: number;
  showHalo?: boolean;
  attackMultiplier?: number;
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
  costText: Phaser.GameObjects.Text;
  statsText: Phaser.GameObjects.Text;
  batchText: Phaser.GameObjects.Text;
  content: AlphaGameObject[];
  readyAt: number;
  displayTime: number;
}

export interface TowerHealthPool {
  members: Tower[];
  hp: number;
  maxHp: number;
  linkCount: number;
}

export type EquationAxis = "horizontal" | "vertical";

export interface NumberTowerState {
  numberMemory?: Array<{ type: CardId; sourceIds: string[]; count: number; storedEvent?: TowerActionEvent }>;
  numberValue?: number;
  equationLevel?: number;
}

export interface Tower extends NumberTowerState {
  parenthesisGuard?: Tower;
  parenthesisInner?: Tower;
  projectileBank?: { shots: StoredTowerShot[]; remaining: number; nextAt: number; outletIndex: number };
  projectileNode?: {
    input: StoredTowerShot[];
    output: StoredTowerShot[];
    processing?: { shots: StoredTowerShot[]; count: number; completeAt: number };
  };
  nextInterceptionAt?: number;
  healingCredit?: number;
  healingUpdatedAt?: number;
  routedSkills?: Partial<Record<CardId, number>>;
  pipelineSkillContexts?: Partial<Record<CardId, { level: number; stats: TowerFinalStats }>>;
  projectileRouteIndex?: number;
  continuousAttack?: boolean;
  topologyTarget?: { lane: number; column: number };
  topologyOrder?: number;
  numberChannels?: Partial<Record<EquationAxis, NumberTowerState>>;
  imitatedSkillLevels?: Partial<Record<CardId, number>>;
  imitatedSkills?: CardId[];
  copiedType?: CardId;
  sourceCardId?: CardId;
  copyRevision?: number;
  healthPool?: TowerHealthPool;
  unyieldingRatio?: number;
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
  moveVisual?: { fromX: number; fromY: number; startedAt: number; duration: number };
  autoUpgrade: boolean;
  reflectProjectiles: boolean;
  nextRepelDirection: -1 | 1;
  facingDirection: -1 | 1;
  statusEffects: StatusEffect[];
  transient: boolean;
  mirroredEffect: boolean;
  turnTargetId?: string;
  placedOrder: number;
  inPlay: boolean;
  body: Phaser.GameObjects.Container;
  border: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  facingIcon: Phaser.GameObjects.Text;
  autoUpgradeBorder: Phaser.GameObjects.Graphics;
  trueDamageBorder: Phaser.GameObjects.Graphics;
  flyingHalo: Phaser.GameObjects.Ellipse;
  hpFill: Phaser.GameObjects.Rectangle;
  negativeHpBack?: Phaser.GameObjects.Rectangle;
  negativeHpFill?: Phaser.GameObjects.Rectangle;
  rangeBorder?: Phaser.GameObjects.Graphics;
  levelText: Phaser.GameObjects.Text;
  trueDamageUntil: number;
  flyingUntil: number;
}

export interface EnemyHealthPool {
  owner: Enemy;
  members: Enemy[];
  hp: number;
  maxHp: number;
}

export interface Enemy {
  healthPool?: EnemyHealthPool;
  healthLinksInitialized?: boolean;
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
  parenthesisCargo?: Enemy[];
  parenthesisCarrier?: Enemy;
  parenthesisHpBonus?: number;
  environmentHpMultiplier?: number;
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
  statusMultiplierCache: {
    reversed?: boolean;
    speed: number;
    attack: number;
    armor: number;
    visualSyncedAt: number;
    visualSyncedX: number;
    visualSyncedY: number;
  };
  statusBorder: Phaser.GameObjects.Arc;
  frozenBorder: Phaser.GameObjects.Rectangle;
  powerIcon: Phaser.GameObjects.Text;
  sunderIcon: Phaser.GameObjects.Text;
  armorIcon: Phaser.GameObjects.Text;
  magicResistanceIcon: Phaser.GameObjects.Text;
  flyingHalo: Phaser.GameObjects.Ellipse;
  nextHasteTrailAt: number;
  inPlay: boolean;
  body: Phaser.GameObjects.Container;
  shape: Phaser.GameObjects.GameObject & { setScale(scale: number): unknown };
  bossOrbitAngle?: number;
  bossOrbitRadius?: number;
  bossCompanionIndex?: number;
  bossCompanionNextActionAt?: number;
  oscillationCenterY?: number;
  oscillationPhase?: number;
  oscillationLastY?: number;
  bossCompanionActionPhase?: BossCompanionActionPhase;
}

export interface Projectile extends ProjectileIntegrity {
  circuitChecked?: boolean;
  sourceBehaviorType?: CardId;
  lastGatheredAt?: number;
  hitCount?: number;
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
  targetBossPart?: CubeBoss;
  sourceTower?: Tower;
  speed?: number;
  acceleration?: number;
  maxSpeed?: number;
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
}

export interface EdgeTower {
  type: "=";
  mode?: "=" | ">" | "<" | "!=";
  level?: number;
  autoUpgrade?: boolean;
  flowCredit?: number;
  flowUpdatedAt?: number;
  axis: "horizontal" | "vertical";
  lane: number;
  column: number;
}

export interface StoredTowerShot extends ProjectileIntegrity {
  action?: { type: CardId; level: number; stats: TowerFinalStats; event: import("./game/towerActions").NativeTowerActionEvent; baseDamage: number };
  pipelineMovedAt?: number;
  type: Exclude<ProjectileKind, "chevron">;
  sourceTower?: Tower;
  sourceBehaviorType?: CardId;
  hitCount: number;
  vx: number;
  vy: number;
  damage: number;
  damageType: DamageType;
  splashRadius: number;
  debuff?: StatusEffectName;
  debuffDuration?: number;
  remainingRange: number;
}

export interface EnemyProjectile extends ProjectileIntegrity {
  appearance?: "bolt" | "star";
  hitCount?: number;
  x: number;
  y: number;
  vx: number;
  damage: number;
  damageType: DamageType;
  sourceLane: number;
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
}

export interface MortarProjectile extends ProjectileIntegrity {
  hitCount?: number;
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
  healthLinkCapacity?: number;
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
  minWave?: number;
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
}

export interface LevelConfig {
  id: string;
  unlockAfter?: string;
  survival?: boolean;
  bossEndless?: boolean;
  unlimitedRankFamilies?: EnemyFamily[];
  enemyKinds: EnemyKind[];
  firstWaveWeight: number;
  waveWeightIncrement: number;
  waveWeightIncrementGrowth?: number;
  totalWaves?: number;
  wavesPerFlag: number;
  waveWeightCap?: number;
  startingChars?: number;
  bossKind?: BossKind;
  bossPhases?: BossPhaseConfig[];
  endless?: boolean;
  ignoreEnemyMinFlag?: boolean;
  specialMechanic?:
    | "rightColumnSeal"
    | "tutorialBasics"
    | "tutorialTowerTypes"
    | "tutorialAutoUpgrade"
    | "tutorialShifter";
}

export interface BossPhaseConfig {
  maxHp: number;
  enemyKinds: EnemyKind[];
  waveWeightCap?: number;
  armor?: number;
  magicResistance?: number;
  finalDamageReduction?: number;
}

export interface BossSkill<Name extends BossSkillName = BossSkillName> extends SkillState {
  name: Name;
  maxSp: number;
  cost: number;
}

export interface PendingBossCopy {
  x: number;
  y: number;
  movementAxis: "x" | "y";
  movementDirection: -1 | 1;
  startedAt: number;
  readyAt: number;
  phaseIndex: number;
  invincibleUntil?: number;
  triggerReinforcements?: boolean;
}

export interface CubeBoss {
  statusEffects: StatusEffect[];
  kind: BossKind;
  rank: number;
  label: string;
  x: number;
  y: number;
  hitboxWidth: number;
  hitboxHeight: number;
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
    charge?: BossSkill<"charge">;
    impact?: BossSkill<"impact">;
    suppression?: BossSkill<"suppression">;
    desperation?: BossSkill<"desperation">;
    endlessWings?: BossSkill<"endlessWings">;
    ultimateAdvance?: BossSkill<"ultimateAdvance">;
    heartbeatAlpha?: BossSkill<"heartbeatAlpha">;
    heartbeatBeta?: BossSkill<"heartbeatBeta">;
    leap?: BossSkill<"leap">;
  };
  contactAttackBuffer: number;
  chargeExpiresAt: number;
  halfHpTriggered: boolean;
  criticalHpTriggered: boolean;
  pendingCriticalSummon: boolean;
  companionsInitialized: boolean;
  companionDeathsHandled: number;
  invincibleUntil: number;
  bossHasteUntil: number; // Legacy save field; live haste is stored in statusEffects.
  nextBossHasteTrailAt: number;
  octahedronCopies?: CubeBoss[];
  pendingCopies?: PendingBossCopy[];
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
