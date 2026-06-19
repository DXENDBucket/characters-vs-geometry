export type VisibleTarget = {
  visible: boolean;
  setVisible(visible: boolean): unknown;
};

export type AlphaTarget = {
  alpha: number;
  setAlpha(alpha: number): unknown;
};

export type PositionTarget = {
  x: number;
  y: number;
  setPosition(x: number, y: number): unknown;
};

export type ScaleTarget = {
  scaleX?: number;
  scaleY?: number;
  setScale?: (x: number, y?: number) => unknown;
};

export function setVisibleIfChanged(target: VisibleTarget, visible: boolean) {
  if (target.visible !== visible) {
    target.setVisible(visible);
  }
}

export function setAlphaIfChanged(target: AlphaTarget, alpha: number) {
  if (target.alpha !== alpha) {
    target.setAlpha(alpha);
  }
}

export function setPositionIfChanged(target: PositionTarget, x: number, y: number) {
  if (target.x !== x || target.y !== y) {
    target.setPosition(x, y);
  }
}

export function setScaleIfChanged(target: ScaleTarget, x: number, y = x) {
  if (target.scaleX !== x || target.scaleY !== y) {
    target.setScale?.(x, y);
  }
}
