export function forEachInitial<T>(items: T[], visit: (item: T) => false | void) {
  const initialCount = items.length;
  let processed = 0;
  let index = 0;
  while (processed < initialCount && index < items.length) {
    const item = items[index];
    processed += 1;
    if (visit(item) === false) {
      return false;
    }
    if (items[index] === item) {
      index += 1;
    }
  }
  return true;
}

const snapshotPool: unknown[][] = [];
let snapshotDepth = 0;

export function forEachSnapshot<T>(items: T[], visit: (item: T) => false | void) {
  const depth = snapshotDepth;
  let snapshot = snapshotPool[depth] as T[] | undefined;
  if (!snapshot) {
    snapshot = [];
    snapshotPool[depth] = snapshot as unknown[];
  }

  snapshotDepth = depth + 1;
  const initialCount = items.length;
  snapshot.length = initialCount;
  for (let index = 0; index < initialCount; index += 1) {
    snapshot[index] = items[index];
  }

  try {
    for (let index = 0; index < initialCount; index += 1) {
      if (visit(snapshot[index]) === false) {
        return false;
      }
    }
    return true;
  } finally {
    snapshot.length = 0;
    snapshotDepth = depth;
  }
}
