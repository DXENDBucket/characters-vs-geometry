import type { Tower, Projectile, EnemyProjectile, MortarProjectile } from "../types";
import type { CircuitRuntime } from "../game/projectileCircuit";
import type { CircuitPresentation } from "../game/projectileCircuitRules";
import { projectileVisualScale } from "../game/projectileIntegrity";

export function circuitPresentation(live: () => CircuitRuntime): CircuitPresentation {
  return {
    captured: projectile => (projectile as Projectile).body.destroy(),
    changed: tower => live().changed(tower as Tower),
    shielded: (tower, type) => live().shielded?.(tower as Tower, type),
    intercepted: (tower, target) => {
      const arc = "progress" in target ? 1 + Math.sin(target.progress * Math.PI) * .26 : 1;
      (target as EnemyProjectile | MortarProjectile).body.setScale(projectileVisualScale(target) * arc);
      live().intercepted?.(tower as Tower, target as EnemyProjectile | MortarProjectile);
    }
  };
}
