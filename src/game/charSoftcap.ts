export const CHAR_SOFTCAP_THRESHOLD = 9_999;
export const CHAR_SOFTCAP_EXPONENT_BASE = 0.7;

export function softcapChars(rawChars: number) {
  return softcapWithLayerLimit(rawChars, activeSoftcapLayers(rawChars));
}

export function rawCharsForSoftcapped(effectiveChars: number) {
  if (effectiveChars <= CHAR_SOFTCAP_THRESHOLD) {
    return effectiveChars;
  }

  let low = 0;
  let high = Math.max(effectiveChars, CHAR_SOFTCAP_THRESHOLD);
  while (softcapChars(high) < effectiveChars) {
    low = high;
    high *= 2;
  }

  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    if (softcapChars(mid) < effectiveChars) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return high;
}

export function charsAreSoftcapped(rawChars: number) {
  return rawChars > CHAR_SOFTCAP_THRESHOLD;
}

function softcapWithLayerLimit(rawChars: number, maxLayers: number) {
  let effectiveChars = rawChars;
  for (let layer = 1; layer <= maxLayers; layer += 1) {
    const rawThreshold = rawThresholdForLayer(layer);
    const effectiveThreshold = softcapWithLayerLimit(rawThreshold, layer - 1);
    effectiveChars = applySoftcapLayer(effectiveChars, effectiveThreshold);
  }
  return effectiveChars;
}

function activeSoftcapLayers(rawChars: number) {
  let layers = 0;
  while (rawChars > rawThresholdForLayer(layers + 1)) {
    layers += 1;
  }
  return layers;
}

function rawThresholdForLayer(layer: number) {
  return 10 ** (layer + 3) - 1;
}

function applySoftcapLayer(value: number, threshold: number) {
  if (value <= threshold) {
    return value;
  }

  return Math.pow(value, CHAR_SOFTCAP_EXPONENT_BASE) * Math.pow(threshold, 1 - CHAR_SOFTCAP_EXPONENT_BASE);
}
