import { enemyArchetypes } from "./data/enemyArchetypes";
import { getEnemyRegistration } from "./registry/enemies";
import { t } from "./i18n";
import type { EnemyKind } from "./types";

export function getEnemyDisplayName(kind: EnemyKind) {
  const registration = getEnemyRegistration(kind);
  if (registration.rank <= enemyArchetypes[registration.family].catalogRanks) return t(registration.nameKey);
  return t("enemy.rankedName", { name: t(`enemyFamily.${registration.family}`), rank: registration.rank });
}
