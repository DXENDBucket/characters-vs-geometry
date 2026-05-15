export type Language = "en" | "zh-CN";

export const DAMAGE_SYMBOLS = {
  physical: "◆",
  magic: "✦",
  true: "◇"
} as const;

export const EFFECT_SYMBOLS = {
  chars: "Aa",
  heal: "♡"
} as const;

const STORAGE_KEY = "characters-vs-geometry-language";

const dictionaries: Record<Language, Record<string, string>> = {
  en: {
    "app.title": "CHARACTERS VS GEOMETRY",
    "operation.root": "OPERATION 0",
    "operation.level": "OPERATION {level}  D{difficulty}",
    "chapter.0": "CHAPTER 0",
    "chapter.1": "CHAPTER 1",
    "button.start": "START",
    "button.back": "BACK",
    "button.restart": "RESTART",
    "button.menu": "MENU",
    "button.erase": "ERASE",
    "button.autoUpgrade": "AUTO",
    "button.debug": "DEBUG",
    "button.encyclopedia": "INDEX",
    "button.language": "中文",
    "label.difficulty": "DIFFICULTY",
    "label.loadout": "LOADOUT",
    "label.enemy": "ENEMY",
    "label.hp": "HP",
    "label.atk": "ATK",
    "label.armor": "ARMOR",
    "label.mr": "MR",
    "label.cost": "COST",
    "label.cd": "CD",
    "label.speed": "SPD",
    "label.weight": "W",
    "label.effect": "EFFECT",
    "label.upgrade": "UPGRADE",
    "label.chars": "CHARS",
    "label.wave": "WAVE",
    "label.wait": "WAIT",
    "label.base": "BASE",
    "label.ko": "KO",
    "label.flag": "FLAG",
    "label.paused": "PAUSED",
    "label.cubeHp": "CUBE HP",
    "label.noLevels": "NO OPERATIONS",
    "encyclopedia.title": "INDEX",
    "encyclopedia.enemies": "ENEMIES",
    "encyclopedia.towers": "TOWERS",
    "difficulty.0": "VERY EASY",
    "difficulty.1": "EASY",
    "difficulty.2": "SLIGHTLY EASY",
    "difficulty.3": "NORMAL",
    "difficulty.4": "SLIGHTLY HARD",
    "difficulty.5": "HARD",
    "difficulty.6": "VERY HARD",
    "difficulty.7": "IMPOSSIBLE",
    "overlay.breach": "BREACH",
    "overlay.clear": "CLEAR",
    "toast.empty": "EMPTY",
    "toast.cooldown": "COOLDOWN",
    "toast.noChars": "NO CHARS",
    "toast.occupied": "OCCUPIED",
    "toast.paused": "PAUSED",
    "toast.resume": "RESUME",
    "toast.autoOn": "AUTO ON",
    "toast.autoOff": "AUTO OFF",
    "toast.debugChars": "+9999 CHARS",
    "enemy.circle": "CIRCLE 1",
    "enemy.circle2": "CIRCLE 2",
    "enemy.circle3": "CIRCLE 3",
    "enemy.triangle": "TRIANGLE 1",
    "enemy.triangle2": "TRIANGLE 2",
    "enemy.triangle3": "TRIANGLE 3",
    "enemy.shootingTriangle": "SHOOTING TRIANGLE 1",
    "enemy.square": "SQUARE 1",
    "enemy.square2": "SQUARE 2",
    "enemy.square3": "SQUARE 3",
    "enemy.bossCube": "BOSS CUBE"
  },
  "zh-CN": {
    "app.title": "字符大战几何体",
    "operation.root": "行动 0",
    "operation.level": "行动 {level}  难度 {difficulty}",
    "chapter.0": "第零章",
    "chapter.1": "第一章",
    "button.start": "开始",
    "button.back": "返回",
    "button.restart": "重开",
    "button.menu": "菜单",
    "button.erase": "橡皮擦",
    "button.autoUpgrade": "自动升级",
    "button.encyclopedia": "图鉴",
    "button.language": "EN",
    "label.difficulty": "难度",
    "label.loadout": "选卡",
    "label.enemy": "敌人",
    "label.hp": "生命",
    "label.atk": "攻击",
    "label.armor": "护甲",
    "label.mr": "法抗",
    "label.cost": "费用",
    "label.cd": "冷却",
    "label.speed": "速度",
    "label.weight": "权重",
    "label.effect": "效果",
    "label.upgrade": "升级",
    "label.chars": "字符",
    "label.wave": "波次",
    "label.wait": "等待",
    "label.base": "底线",
    "label.ko": "击破",
    "label.flag": "旗帜",
    "label.paused": "暂停",
    "label.cubeHp": "立方体生命",
    "label.noLevels": "暂无行动",
    "encyclopedia.title": "图鉴",
    "encyclopedia.enemies": "敌怪",
    "encyclopedia.towers": "塔",
    "difficulty.0": "非常简单",
    "difficulty.1": "简单",
    "difficulty.2": "略微简单",
    "difficulty.3": "普通",
    "difficulty.4": "略微困难",
    "difficulty.5": "困难",
    "difficulty.6": "非常困难",
    "difficulty.7": "不可能",
    "overlay.breach": "失守",
    "overlay.clear": "完成",
    "toast.empty": "空位",
    "toast.cooldown": "冷却中",
    "toast.noChars": "字符不足",
    "toast.occupied": "已占用",
    "toast.paused": "已暂停",
    "toast.resume": "继续",
    "toast.autoOn": "自动升级开启",
    "toast.autoOff": "自动升级关闭",
    "enemy.circle": "圆 1",
    "enemy.circle2": "圆 2",
    "enemy.circle3": "圆 3",
    "enemy.triangle": "三角 1",
    "enemy.triangle2": "三角 2",
    "enemy.triangle3": "三角 3",
    "enemy.shootingTriangle": "射击三角 1",
    "enemy.square": "正方形 1",
    "enemy.square2": "正方形 2",
    "enemy.square3": "正方形 3",
    "enemy.bossCube": "Boss 立方体"
  }
};

export function getLanguage(): Language {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh-CN") {
    return stored;
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function toggleLanguage() {
  const next: Language = getLanguage() === "zh-CN" ? "en" : "zh-CN";
  window.localStorage.setItem(STORAGE_KEY, next);
  return next;
}

export function t(key: string, params: Record<string, string | number> = {}) {
  const dictionary = dictionaries[getLanguage()] ?? dictionaries.en;
  const template = dictionary[key] ?? dictionaries.en[key] ?? key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, `${value}`),
    template
  );
}
