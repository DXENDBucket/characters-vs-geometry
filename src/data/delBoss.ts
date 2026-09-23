export const DEL_DELETE_STACK = {
  maxSp: 40,
  initialSp: 40,
  cost: 40,
  warningMs: 5000,
  sealMs: 90000,
  glitchMs: 1000
} as const;

export const DEL_SWEEP = { hpRatio: .75, warningMs: 3000, speed: 50, sealMs: 40000 } as const;
