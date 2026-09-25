export function mathVectors() {
  const vectors = [];
  const add = (name, ...args) => vectors.push({ name, args: args.map(encodeNumber) });
  const edges = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE,
    Infinity, -Infinity, NaN, 1, -1, Math.PI, -Math.PI, Math.PI / 2, 1e-300, 1e300];
  for (const value of edges) {
    for (const name of ["sin", "cos", "tan", "sqrt", "square"]) add(name, value);
    for (const other of edges) for (const name of ["atan2", "hypot", "pow"]) add(name, value, other);
  }
  let seed = 114514;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1000; i++) {
    const angle = (random() - .5) * 1e6, x = (random() - .5) * 1e4, y = (random() - .5) * 1e4;
    for (const name of ["sin", "cos", "tan"]) add(name, angle);
    add("atan2", y, x); add("hypot", x, y); add("sqrt", Math.abs(x)); add("square", x);
    add("pow", 1 + random() * 1e6, .7); add("pow", 1.2, i % 91);
  }
  return vectors;
}
export function encodeNumber(value) {
  return Object.is(value, -0) ? "-0" : Number.isFinite(value) ? value : String(value);
}
export function numberBits(value) {
  if (Number.isNaN(value)) return "NaN";
  const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, value, false);
  return bytes.getUint32(0).toString(16).padStart(8, "0") + bytes.getUint32(4).toString(16).padStart(8, "0");
}
export function evaluateVectors(math, vectors) {
  return vectors.map(v => numberBits(math[v.name](...v.args.map(Number))));
}
