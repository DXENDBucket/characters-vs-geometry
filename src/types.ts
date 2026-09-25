import type Phaser from "phaser";
import type { TowerActionEvent } from "./game/towerActions";
import type { ProjectileIntegrity } from "./game/projectileIntegrity";
import type { EnemyProjectileState, MortarProjectileState, ProjectileState } from "./game/projectileState";
import type { TowerState } from "./game/towerState";
import type { EnemyState } from "./game/enemyState";
import type { BossRotationState, BossState } from "./game/bossState";
import type { BattleCardState } from "./game/battleLoadout";

export type CardId =
  | "?"
  | `?${string}`
  | "()"
  | "[]"
  | "!"
  | "+"
  | "-"
  | "*"
  | "/"
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
  | "chevronLeader"
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
  | "del"
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
  | "leap"
  | "deleteStack"
  | "deleteFormat";
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
  attackPower: number;
  attackMultiplier: number;
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

export interface CardView {
  readonly state: Readonly<BattleCardState>;
  frame: Phaser.GameObjects.Rectangle;
  cooldownFill: Phaser.GameObjects.Rectangle;
  costText: Phaser.GameObjects.Text;
  statsText: Phaser.GameObjects.Text;
  batchText: Phaser.GameObjects.Text;
  content: AlphaGameObject[];
  displayTime: number;
}

export interface TowerHealthPool<Member = Tower> {
  members: Member[];
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

export interface Tower extends TowerState {
  parenthesisGuard?: Tower;
  parenthesisInner?: Tower;
  healthPool?: TowerHealthPool;
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
}

export interface EnemyHealthPool<Member = Enemy> {
  owner: Member;
  members: Member[];
  hp: number;
  maxHp: number;
}

export interface Enemy extends EnemyState {
  healthPool?: EnemyHealthPool;
  burrowCargo?: Enemy[];
  parenthesisCargo?: Enemy[];
  parenthesisCarrier?: Enemy;
  statusBorder: Phaser.GameObjects.Arc;
  frozenBorder: Phaser.GameObjects.Rectangle;
  powerIcon: Phaser.GameObjects.Image;
  sunderIcon: Phaser.GameObjects.Image;
  armorIcon: Phaser.GameObjects.Image;
  magicResistanceIcon: Phaser.GameObjects.Image;
  flyingHalo: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Container;
  shape: Phaser.GameObjects.GameObject & { setScale(scale: number): unknown };
}

export interface Projectile extends ProjectileState {
  targetEnemy?: Enemy;
  targetBossPart?: CubeBoss;
  sourceTower?: Tower;
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
}

export interface EdgeTower {
  entityId?: string;
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

export interface EnemyProjectile extends EnemyProjectileState {
  body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics;
}

export interface MortarProjectile extends MortarProjectileState {
  sourceEnemy?: Enemy;
  sourceTower?: Tower;
  targetEnemy?: Enemy;
  targetTower?: Tower;
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
  attackPower: number;
  attackMultiplier: number;
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
  spawnLanes?: number[];
  deployableLanes?: number[];
  flagWeightMultiplier?: number;
  extraWaveSpawns?: { kind: EnemyKind; lane?: number }[];
  periodicTowerNullification?: { intervalMs: number; durationMs: number };
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
    | "tutorialPractice"
    | "tutorialTowerTypes"
    | "tutorialAutoUpgrade"
    | "tutorialShifter"
    | "tutorialDamage";
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

export interface DelSweepState {
  phase: "warning" | "outbound" | "returning" | "complete";
  startedAt: number;
  homeX: number;
  homeY: number;
  previousInvincibleUntil: number;
  sealedCells: string[];
}

export interface DelLaneSweepState<Part = CubeBoss> {
  stage?: "half" | "quarter"; // Older saves without a stage are the half-health event.
  phase: "warning" | "sweeping" | "summoning" | "complete";
  startedAt: number;
  previousInvincibleUntil: number;
  sealedCells: string[];
  parts: Part[];
  summons: number;
}

export interface CubeBoss extends BossState, BossRotationState {
  delLaneSweep?: DelLaneSweepState;
  octahedronCopies?: CubeBoss[];
  body: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  labelText: Phaser.GameObjects.Text;
}
