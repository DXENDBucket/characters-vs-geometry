import fs from "node:fs";

const files = {
  types: read("src/types.ts"),
  cards: read("src/data/cards.ts"),
  cardBehaviors: read("src/game/cardBehaviors.ts"),
  enemies: read("src/data/enemies.ts"),
  enemyRegistry: read("src/registry/enemies.ts"),
  levels: read("src/data/levels.ts"),
  waveReference: read("wave-reference.md")
};

const errors = [];

const cardIds = parseUnionLiterals(files.types, "CardId");
const enemyKinds = parseUnionLiterals(files.types, "EnemyKind");
const bossKinds = parseUnionLiterals(files.types, "BossKind");
const cardDefinitions = parseCardDefinitions(files.cards);
const enemyDefinitions = parseObjectKeys(files.enemies, "enemyDefinitions");
const enemyRegistrations = parseObjectKeys(files.enemyRegistry, "enemyRegistrations");
const cardBehaviorIds = parseObjectKeys(files.cardBehaviors, "cardBehaviorsById");
const levelConfigIds = parseLevelConfigIds(files.levels);
const levelNodeIds = parseLevelNodeIds(files.levels);
const levelEnemyKinds = parseLevelEnemyKinds(files.levels);
const levelBossKinds = parseLevelBossKinds(files.levels);
const cardRows = parseWaveReferenceCards(files.waveReference);

expectSameSet("CardId union", cardIds, "cardDefinitions", cardDefinitions.map((card) => card.id));
expectSameSet("CardId union", cardIds, "cardBehaviorsById", cardBehaviorIds);
expectSameSet("EnemyKind union", enemyKinds, "enemyDefinitions", enemyDefinitions);
expectSameSet("EnemyKind union", enemyKinds, "enemyRegistrations", enemyRegistrations);
expectSameSet("levelNodes", levelNodeIds, "levelConfigs", levelConfigIds);

for (const kind of levelEnemyKinds) {
  if (!enemyKinds.includes(kind)) {
    errors.push(`Level config references unknown enemy kind "${kind}".`);
  }
}

for (const kind of levelBossKinds) {
  if (!bossKinds.includes(kind)) {
    errors.push(`Level config references unknown boss kind "${kind}".`);
  }
}

for (const card of cardDefinitions) {
  const row = cardRows.get(card.id);
  if (!row) {
    errors.push(`wave-reference.md is missing character row for "${card.id}".`);
    continue;
  }

  compareField(card.id, "cost", card.cost, row.cost);
  compareField(card.id, "HP", card.maxHp, row.hp);
  compareField(card.id, "armor", card.armor, row.armor);
  compareField(card.id, "MR", card.magicResistance, row.mr);
}

for (const id of cardRows.keys()) {
  if (!cardDefinitions.some((card) => card.id === id)) {
    errors.push(`wave-reference.md has character row for unknown card "${id}".`);
  }
}

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Validation passed.");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function parseUnionLiterals(source, typeName) {
  const match = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!match) {
    errors.push(`Could not find type union "${typeName}".`);
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((literal) => literal[1]);
}

function parseCardDefinitions(source) {
  return [...source.matchAll(/^\s*\{\s*\n\s*id: "([^"]+)",[\s\S]*?^\s*\}/gm)].map((match) => {
    const block = match[0];
    return {
      id: match[1],
      cost: numberField(block, "cost"),
      maxHp: numberField(block, "maxHp"),
      armor: numberField(block, "armor") ?? 0,
      magicResistance: numberField(block, "magicResistance") ?? 0
    };
  });
}

function parseObjectKeys(source, objectName) {
  const objectBody = parseObjectBody(source, objectName);
  if (!objectBody) {
    errors.push(`Could not find object "${objectName}".`);
    return [];
  }
  return [...objectBody.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
}

function parseObjectBody(source, objectName) {
  const start = source.indexOf(objectName);
  if (start < 0) {
    return "";
  }
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) {
    return "";
  }

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  return "";
}

function parseLevelConfigIds(source) {
  const body = parseObjectBody(source, "levelConfigs");
  return [...body.matchAll(/^\s{2}"([^"]+)":/gm)].map((match) => match[1]);
}

function parseLevelNodeIds(source) {
  const match = source.match(/levelNodes:[\s\S]*?=\s*\[([\s\S]*?)\];/);
  if (!match) {
    errors.push("Could not find levelNodes.");
    return [];
  }
  return [...match[1].matchAll(/id: "([^"]+)"/g)].map((node) => node[1]);
}

function parseLevelEnemyKinds(source) {
  return unique(
    [...source.matchAll(/enemyKinds:\s*\[([^\]]*)\]/g)].flatMap((match) =>
      [...match[1].matchAll(/"([^"]+)"/g)].map((kind) => kind[1])
    )
  );
}

function parseLevelBossKinds(source) {
  return unique([...source.matchAll(/bossKind: "([^"]+)"/g)].map((match) => match[1]));
}

function parseWaveReferenceCards(source) {
  return new Map(
    [...source.matchAll(/^\| ([A-Za-z]) \| [^|]+ \| [^|]+ \| (\d+) \| [^|]+ \| (\d+) \| (\d+) \| (\d+) \|/gm)].map(
      (match) => [
        match[1],
        {
          cost: Number(match[2]),
          hp: Number(match[3]),
          armor: Number(match[4]),
          mr: Number(match[5])
        }
      ]
    )
  );
}

function numberField(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}:\\s*([0-9_]+)`));
  return match ? Number(match[1].replaceAll("_", "")) : undefined;
}

function compareField(id, label, codeValue, docValue) {
  if (codeValue !== docValue) {
    errors.push(`Card "${id}" ${label} mismatch: code=${codeValue}, wave-reference=${docValue}.`);
  }
}

function expectSameSet(leftName, leftItems, rightName, rightItems) {
  const left = unique(leftItems);
  const right = unique(rightItems);
  for (const item of left) {
    if (!right.includes(item)) {
      errors.push(`${rightName} is missing "${item}" from ${leftName}.`);
    }
  }
  for (const item of right) {
    if (!left.includes(item)) {
      errors.push(`${rightName} has extra "${item}" not present in ${leftName}.`);
    }
  }
}

function unique(items) {
  return [...new Set(items)];
}
