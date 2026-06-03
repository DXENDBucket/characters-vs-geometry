import type { CardId } from "../types";

export type ToolControlAction =
  | "tool:erase"
  | "tool:autoUpgrade"
  | "tool:shifter"
  | "tool:debugDamage"
  | "tool:debugChars"
  | "tool:autoUpgradeEnabled"
  | "tool:autoUpgradeReserve"
  | "tool:pause";

export type ControlActionId = ToolControlAction | `slot:${number}` | `card:${CardId}`;

export interface ToolControlDefinition {
  id: ToolControlAction;
  labelKey: string;
}

const STORAGE_KEY = "characters-vs-geometry-keybindings";

export const CONTROL_SLOT_COUNT = 10;

export const toolControlDefinitions: ToolControlDefinition[] = [
  { id: "tool:erase", labelKey: "control.erase" },
  { id: "tool:autoUpgrade", labelKey: "control.autoUpgrade" },
  { id: "tool:shifter", labelKey: "control.shifter" },
  { id: "tool:debugDamage", labelKey: "control.debugDamage" },
  { id: "tool:debugChars", labelKey: "control.debugChars" },
  { id: "tool:autoUpgradeEnabled", labelKey: "control.autoUpgradeEnabled" },
  { id: "tool:autoUpgradeReserve", labelKey: "control.autoUpgradeReserve" },
  { id: "tool:pause", labelKey: "control.pause" }
];

const defaultKeybindings: Partial<Record<ControlActionId, string>> = {
  "tool:erase": "Digit1",
  "tool:autoUpgrade": "Digit2",
  "tool:shifter": "Digit3",
  "tool:pause": "Space"
};

const keyLabels: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  Enter: "Enter",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right"
};

export function cardControlAction(id: CardId): ControlActionId {
  return `card:${id}`;
}

export function slotControlAction(index: number): ControlActionId {
  return `slot:${index}`;
}

export function getKeybindings() {
  const stored = readStoredKeybindings();
  return { ...defaultKeybindings, ...stored };
}

export function getKeybinding(actionId: ControlActionId) {
  return getKeybindings()[actionId] ?? "";
}

export function setKeybinding(actionId: ControlActionId, code: string | null) {
  const bindings = getKeybindings();
  const nextCode = code ?? "";

  for (const [otherActionId, otherCode] of Object.entries(bindings)) {
    if (otherActionId !== actionId && otherCode === nextCode && nextCode !== "") {
      bindings[otherActionId as ControlActionId] = "";
    }
  }

  bindings[actionId] = nextCode;
  writeStoredKeybindings(bindings);
}

export function resetKeybindings() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function keyCodeForEvent(event: KeyboardEvent) {
  return event.code || event.key;
}

export function captureKeyCode(event: KeyboardEvent) {
  return event.key === "Escape" || event.code === "Escape" ? null : keyCodeForEvent(event);
}

export function controlMatches(event: KeyboardEvent, actionId: ControlActionId) {
  const code = getKeybinding(actionId);
  return code !== "" && keyCodeForEvent(event) === code;
}

export function matchingControlAction(event: KeyboardEvent, actionIds: ControlActionId[]) {
  const code = keyCodeForEvent(event);
  if (!code) {
    return undefined;
  }

  const bindings = getKeybindings();
  return actionIds.find((actionId) => bindings[actionId] === code);
}

export function formatKeyCode(code: string | undefined) {
  if (!code) {
    return "";
  }

  if (keyLabels[code]) {
    return keyLabels[code];
  }

  if (code.startsWith("Key")) {
    return code.slice(3);
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  if (code.startsWith("Numpad")) {
    return `Num ${code.slice(6)}`;
  }

  return code;
}

function readStoredKeybindings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([_actionId, code]) => typeof code === "string")
    ) as Partial<Record<ControlActionId, string>>;
  } catch {
    return {};
  }
}

function writeStoredKeybindings(bindings: Partial<Record<ControlActionId, string>>) {
  const stored = Object.fromEntries(
    Object.entries(bindings).filter(([actionId, code]) => {
      return typeof code === "string" && defaultKeybindings[actionId as ControlActionId] !== code;
    })
  );

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}
