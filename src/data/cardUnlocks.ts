import type { CardId } from "../types";

export const INITIAL_CARD_IDS = ["A", "B", "D", "X", "F", "G"] as const satisfies readonly CardId[];

// A string value means the card becomes available after that operation is cleared.
// Chapter 5 intentionally has no unlocks; m is the final unlock after 4-10.
export const cardUnlockRequirements: Record<CardId, string | null> = {
  A: null,
  a: "1-1",
  B: null,
  b: "2-2",
  C: "1-2",
  c: "2-4",
  D: null,
  d: "3-1",
  e: "3-9",
  O: "1-10",
  R: "1-10",
  X: null,
  x: "3-7",
  E: "1-1",
  M: "1-6",
  m: "4-10",
  W: "1-6",
  w: "3-7",
  F: null,
  f: "3-8",
  G: null,
  H: "1-3",
  h: "1-8",
  I: "1-4",
  i: "4-8",
  Q: "2-4",
  J: "2-3",
  K: "1-5",
  k: "2-10",
  S: "3-3",
  s: "4-4",
  L: "2-5",
  l: "3-5",
  r: "3-5",
  N: "2-1",
  q: "2-1",
  n: "2-6",
  T: "2-7",
  t: "3-2",
  U: "3-6",
  V: "2-8",
  v: "2-9",
  P: "1-7",
  p: "1-8",
  Y: "1-5",
  Z: "1-9"
};

export function cardUnlockRequirement(id: CardId) {
  return cardUnlockRequirements[id];
}
