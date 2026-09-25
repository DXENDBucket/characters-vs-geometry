import sin from "@stdlib/math-base-special-sin";
import cos from "@stdlib/math-base-special-cos";
import tan from "@stdlib/math-base-special-tan";
import angle from "@stdlib/math-base-special-atan2";
import hypot from "@stdlib/math-base-special-hypot";
import power from "@stdlib/math-base-special-pow";

// Pinned pure-JS kernels, not platform libm. Basic arithmetic and sqrt follow
// ECMAScript 2025 binary64 rounding; presentation may still use native trig.
export { sin, cos, tan, hypot };
export const sqrt = Math.sqrt;
export const square = (value: number) => value * value;
export function atan2(y: number, x: number) {
  const result = angle(y, x);
  // A subnormal positive y/x can underflow to +0; retain the input quadrant.
  return x < 0 && y < 0 && result > 0 ? -Math.PI : result;
}
export function pow(base: number, exponent: number) {
  if (exponent === 0) return 1;
  if (base === 0) {
    const odd = Number.isInteger(exponent) && exponent % 2 !== 0;
    return exponent > 0 ? odd ? base : 0 : exponent < 0 ? odd ? 1 / base : Infinity : NaN;
  }
  if (Math.abs(base) === 1 && !Number.isFinite(exponent)) return NaN;
  if (base === -Infinity && Number.isFinite(exponent)) {
    const sign = exponent % 2 === 1 || exponent % 2 === -1 ? -1 : 1;
    return sign * (exponent > 0 ? Infinity : 0);
  }
  if (base < 0) {
    if (Number.isFinite(exponent) && !Number.isInteger(exponent)) return NaN;
    return (exponent % 2 !== 0 && Number.isFinite(exponent) ? -1 : 1) * power(-base, exponent);
  }
  return power(base, exponent);
}
