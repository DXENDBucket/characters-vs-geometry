import type { Tower } from "../types";
import type { TowerSkillPresentation } from "../game/towerSkillPresentation";

export const TOWER_SKILL_INDICATORS: Pick<TowerSkillPresentation, "borderAlpha" | "rangeAlpha"> = {
  borderAlpha: (state, alpha) => {
    const tower = state as Tower;
    if (tower.border.alpha !== alpha) tower.border.setAlpha(alpha);
  },
  rangeAlpha: (state, alpha) => {
    const tower = state as Tower;
    if (tower.rangeBorder && tower.rangeBorder.alpha !== alpha) tower.rangeBorder.setAlpha(alpha);
  }
};
