export const DEL_DELETE_STACK = {
  maxSp: 40,
  initialSp: 40,
  cost: 40,
  warningMs: 5000,
  sealMs: 90000,
  glitchMs: 1000
} as const;

export const DEL_SWEEP = { hpRatio: .75, warningMs: 3000, speed: 600, sealMs: 40000 } as const;

export const DEL_LANE_SWEEP = {
  hpRatio: .5, warningMs: 3000, speed: 600, sealMs: 40000,
  lanes: [1, 5], summonCount: 3, summonIntervalMs: 1000, summonKind: "triangleRam5"
} as const;
