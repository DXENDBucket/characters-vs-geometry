import type { DamageType } from "../types";
import { calculateDamage } from "./damage";

export interface DamageLesson {
  id: string;
  type: DamageType;
  attack: number;
  multiplier: number;
  hits: number;
  armor: number;
  resistance: number;
}

export const damageLessons: readonly DamageLesson[] = [
  { id: "physical", type: "physical", attack: 400, multiplier: 1, hits: 1, armor: 300, resistance: 50 },
  { id: "floor", type: "physical", attack: 400, multiplier: 1, hits: 1, armor: 500, resistance: 50 },
  { id: "magic", type: "magic", attack: 400, multiplier: 1, hits: 1, armor: 500, resistance: 50 },
  { id: "true", type: "true", attack: 400, multiplier: 1, hits: 1, armor: 500, resistance: 50 },
  { id: "hits", type: "physical", attack: 400, multiplier: .25, hits: 4, armor: 300, resistance: 50 }
];

// The lesson shares the combat calculation; examples exclude difficulty and special reductions.
export function damageLessonResult(lesson: DamageLesson) {
  const raw = lesson.attack * lesson.multiplier;
  const perHit = calculateDamage(raw, lesson.type, lesson.armor, lesson.resistance);
  return { raw, perHit, total: perHit * lesson.hits };
}
