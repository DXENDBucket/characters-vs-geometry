import fs from "node:fs";
import ts from "typescript";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const files = {
  types: read("src/types.ts"),
  cards: read("src/data/cards.ts"),
  cardBehaviors: read("src/game/cardBehaviors.ts"),
  cardUnlocks: read("src/data/cardUnlocks.ts"),
  levels: read("src/data/levels.ts"),
  waveReference: read("wave-reference.md")
};

const errors = [];

const cardIds = parseUnionLiterals(files.types, "CardId");
const enemyFamilies = parseUnionLiterals(files.types, "EnemyFamily");
const load = createTypeScriptLoader();
const enemyRegistry = load("src/registry/enemies.ts");
const { enemyArchetypes } = load("src/data/enemyArchetypes.ts");
const bossKinds = parseUnionLiterals(files.types, "BossKind");
const cardDefinitions = parseCardDefinitions(files.cards);
const enemyDefinitions = Object.keys(enemyRegistry.allEnemyDefinitions);
const enemyRegistrations = Object.keys(enemyRegistry.allEnemyRegistrations);
const cardBehaviorIds = parseObjectKeys(files.cardBehaviors, "cardBehaviorsById");
const cardUnlockRequirements = parseCardUnlockRequirements(files.cardUnlocks);
const initialCardIds = parseStringArray(files.cardUnlocks, "INITIAL_CARD_IDS");
const { levelConfigs, levelNodes } = load("src/data/levels.ts");
const levelConfigIds = Object.keys(levelConfigs);
const levelNodeIds = levelNodes.map(node => node.id);
const levelEnemyKinds = unique(Object.values(levelConfigs).flatMap(level => [
  ...level.enemyKinds, ...(level.bossPhases ?? []).flatMap(phase => phase.enemyKinds)
]));
const levelBossKinds = unique(Object.values(levelConfigs).map(level => level.bossKind).filter(Boolean));
const cardRows = parseWaveReferenceCards(files.waveReference);

expectSameSet("CardId union", cardIds, "cardDefinitions", cardDefinitions.map((card) => card.id));
expectSameSet("CardId union", cardIds, "cardBehaviorsById", cardBehaviorIds);
expectSameSet("CardId union", cardIds, "cardUnlockRequirements", cardUnlockRequirements.map((entry) => entry.id));
expectSameSet(
  "INITIAL_CARD_IDS",
  initialCardIds,
  "cards with no unlock requirement",
  cardUnlockRequirements.filter((entry) => entry.levelId === null).map((entry) => entry.id)
);
expectSameSet("EnemyFamily union", enemyFamilies, "enemyArchetypes", Object.keys(enemyArchetypes));
expectSameSet("enemyDefinitions", enemyDefinitions, "enemyRegistrations", enemyRegistrations);
expectSameSet("levelNodes", levelNodeIds, "levelConfigs", levelConfigIds);

for (const kind of levelEnemyKinds) {
  if (!enemyRegistry.isEnemyKind(kind)) {
    errors.push(`Level config references unknown enemy kind "${kind}".`);
  } else {
    const definition = enemyRegistry.getEnemyDefinition(kind);
    for (const field of ["hp", "armor", "magicResistance", "damage", "weight"]) {
      if (!Number.isFinite(definition[field]) || definition[field] < 0) errors.push(`Invalid ${kind}.${field}.`);
    }
  }
}

for (const kind of levelBossKinds) {
  if (!bossKinds.includes(kind)) {
    errors.push(`Level config references unknown boss kind "${kind}".`);
  }
}

for (const requirement of cardUnlockRequirements) {
  if (requirement.levelId !== null && !levelNodeIds.includes(requirement.levelId)) {
    errors.push(`Card "${requirement.id}" has unknown unlock level "${requirement.levelId}".`);
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

function parseCardUnlockRequirements(source) {
  const body = parseObjectBody(source, "cardUnlockRequirements");
  if (!body) {
    errors.push("Could not find cardUnlockRequirements.");
    return [];
  }

  return objectProperties(source, "cardUnlockRequirements").map(property => ({
    id: property.name.text,
    levelId: ts.isStringLiteral(property.initializer) ? property.initializer.text : null
  }));
}

function parseStringArray(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!match) {
    errors.push(`Could not find array "${name}".`);
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function parseObjectKeys(source, objectName) {
  const objectBody = parseObjectBody(source, objectName);
  if (!objectBody) {
    errors.push(`Could not find object "${objectName}".`);
    return [];
  }
  return objectProperties(source, objectName).map(property => property.name.text);
}

function objectProperties(source, name) {
  const file = ts.createSourceFile("data.ts", source, ts.ScriptTarget.Latest, true);
  let properties = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name &&
        node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      properties = node.initializer.properties.filter(ts.isPropertyAssignment);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return properties;
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

function parseWaveReferenceCards(source) {
  return new Map(
    [...source.matchAll(/^\| ([^|\s]+) \| [^|]+ \| [^|]+ \| (\d+) \| [^|]+ \| (\d+) \| (\d+) \| (\d+) \|/gm)].map(
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
