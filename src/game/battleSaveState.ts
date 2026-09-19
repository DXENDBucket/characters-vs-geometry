import type { CardId, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower, WaveTracker } from "../types";
import type { ScheduledBattleAction } from "./battleActions";
import type { LoadoutReselection } from "./loadoutReselection";
import type { TowerShifterController } from "./towerShifter";
import type { TowerStorageController } from "./towerStorage";
import type { SpellMortarFlight } from "./towerSkills";

export interface BattleSaveState {
  levelElapsed: number;
  battleTime: number;
  cardTime: number;
  nextNaturalProduceAt: number;
  chars: number;
  baseIntegrity: number;
  wave: number;
  waveTracker: WaveTracker | null;
  enemiesDefeated: number;
  towerOrder: number;
  gameSpeed: number;
  selectedCardId: CardId;
  cardDeadlines: Array<{ id: CardId; readyAt: number }>;
  autoUpgradeEnabled: boolean;
  autoUpgradeReserveChars: number;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  actions: ScheduledBattleAction[];
  storage: ReturnType<TowerStorageController["snapshot"]>;
  shifter: ReturnType<TowerShifterController["snapshot"]>;
  reselection: ReturnType<LoadoutReselection["snapshot"]>;
  extraction: number;
  spellMortarFlights: SpellMortarFlight[];
  sealedCells: string[];
}
