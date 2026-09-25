# Deterministic Battle Math

Rules 9 use `game/battleMath.ts` for sine, cosine, tangent, atan2, hypot and
exponentiation. These operations previously differed between Node and browser
engines. In the 5-10 P3 fixture this changed companion coordinates by a few binary64
bits. Canonical checksums must detect such differences, not round them away.

## Numeric Contract

- Fixed pure-JavaScript stdlib kernels: sin/cos/tan/atan2/pow 0.3.1, hypot 0.2.4.
  Direct versions and the transitive dependency lockfile are part of the rules.
  Native-addon selection and platform transcendental functions are not used.
- Basic arithmetic, integer operations and `Math.sqrt` retain the ECMAScript
  binary64 behavior. The runtime requires the fully specified sqrt rounding in
  [ECMAScript 2025](https://tc39.es/ecma262/2025/multipage/numbers-and-dates.html#sec-math.sqrt).
  `square` explicitly multiplies; `**` is prohibited in the core dependency graph.
- The wrappers retain JS signed-zero, NaN, infinite-exponent and negative-base
  power conventions. They also fix a negative atan2 quadrant when an extremely
  small ratio underflows, and avoid stdlib's oddness classification for very
  large even exponents. These corrections have explicit regression vectors.
- NaN payload bits are not meaningful state. Negative zero is meaningful for
  direction: local/wire graph codecs preserve it as `{ number: "-0" }`.
  Graphs without that tag remain readable.
- Native trig remains allowed in presentation-only rendering. It must not feed
  back into authoritative positions, damage, geometry, RNG or commands.

The implementation comes from [stdlib](https://github.com/stdlib-js/stdlib).
Builds emit dependency license texts and preserve source license notices in JS
assets. `THIRD-PARTY-NOTICES.txt` is copied to both web and desktop distributions.

## Compatibility

Battle rules are version 9, transport protocol 3 and wire graph version 2.
Older saved battles load their stored units, then advance under current rules.
Older rule-version recordings are rejected; an old recording is not an exact
rules-9 replay. Old protocol/wire peers cannot silently join a new session.

`test-battle-determinism-browser.mjs --legacy-math=true` substitutes native math
through a test-only browser route to retain the pre-change behavior baselines.
There is no legacy-math production switch. Default tests use new rules-9 hashes
and exact replay/save continuation. The IF-1 baseline changed with deterministic
power calculations; this is an intentional versioned change, not a tolerated desync.

## Evidence

- `npm run test:rules` first runs the four math tests. They inspect the actually
  loaded kernel dependency tree, check special values and accuracy, and execute
  all vectors after disabling native approximated math functions.
- Module-boundary tests follow the emitted BattleRuntime dependency graph and
  reject native approximated Math calls and exponent operators.
- `test-battle-math-browser.mjs` compares 9,848 vectors bit-for-bit with Node in
  Chromium, Firefox and WebKit. It checks both dev modules and a production-
  minified Vite bundle, with native approximated functions disabled.
- `test-battle-runtime-browser.mjs --engine=...` compares actual GameScene and
  independent Node runtime state for 11 scenarios, 3,600 ticks each, every 300
  ticks. A wire-checkpoint continuation starts at tick 1,500. All three tested
  engines pass without coordinate tolerance, including all four 5-10 phases.
- `test-battle-sync-browser.mjs` runs separate Chromium, Firefox and WebKit
  processes through an authenticated test relay. Real command, reconnection,
  fault and selected-content checks agree across all three engines.

These are tested platforms and fixtures, not proof for every browser version,
CPU architecture or possible long-running battle. The production transport still
needs a supported-runtime policy. Dependency upgrades require a rules/version
review and these checks. Mixed-battle cost and full synchronization profiling
remain required; determinism work does not by itself establish an FPS gain.
