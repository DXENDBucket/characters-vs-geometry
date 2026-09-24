# Wave Reference

## Enemy Weights

Enemy rank weight now uses the same actual-level breakpoints as tower upgrades: `20, 60, 140, 300, 620, ...` (`next = current * 2 + 20`). Reaching the breakpoint uses the previous band; only levels beyond it use the new slope. Each family's base per-rank weight increment is multiplied by `1/2/4/8/16/...` in successive bands (these are growth multipliers, not fractions). Total weight remains continuous: `baseWeight + growthWeight * weightedUpgradeCount(rank)`. Levels 1-20 are unchanged; HP, attack, speed, skills and zero-weight leaders are unchanged. For Triangle, ranks 20/21/60/61 have weights `1170/1290/5970/6210`.

Both IF and IF-BE invert this piecewise weight curve by bands when counting affordable ranks, without enumerating an unlimited catalog. Every affordable rank still participates in the original sampling distribution; Circle's rank-IV natural-spawn cap remains. Battle rules version is now 3: version-1/2 snapshots remain loadable and future waves use new weights, while old replays are rejected rather than played with different outcomes.

Triangle Ram of every rank is excluded from natural wave pools during waves 1-4 and becomes eligible from wave 5. This applies to story, ASCII Expansion and both endless modes, including stages that ignore flag restrictions. Scripted Boss summons are unaffected.

All endless stages (IF and IF-BE) apply an environment HP multiplier to newly created non-Boss enemies: `1 + 0.35 * floor(max(0, currentWave - 1) / wavesPerFlag)`. Waves 1-10 use x1, 11-20 use x1.35, 21-30 use x1.70, with no cap. It does not wait for the flag wave to be cleared. Existing enemies retain their spawn multiplier, including after promotion, storage and save/resume. Summoned and split enemies use the current multiplier; Boss HP is unchanged. The multiplier is applied last, after native health bonuses; health-sharing uses each member's final capacity.

Dollar `$` ranks I/II/III have weights `240/440/640` (`240 + 200 * (rank - 1)`), HP `20000`, armor `200`, MR `50`, physical ATK `800`, attack speed `60`, movement speed `10`. Incitement: initial `20/25` SP, `1 SP/s`, automatically spends `20` at full SP with eligible targets. Grants the closest `4 * rank` other minions `+30% Power` and `+100% Haste` for `15s`; SP recovery continues. Excludes self, leaders, Bosses, Boss companions and Solar Bombs. Power supports source-defined multipliers and independent deadlines for different strengths; only the strongest active value applies. Rank I first appears in AE-7.

| Enemy | Weight | HP | Armor | Attack | DMG | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Circle 1 | 10 | 3000 | 100 | 400 | ◆ | Body label `I`; average speed `10` |
| Circle 2 | 50 | 3000 | 100 | 400 | ◆ | Body label `II`; on death summons Circle 1 in upper/current/lower lanes at the same x, skipping missing lanes |
| Circle 3 | 90 | 3000 | 100 | 400 | ◆ | Body label `III`; on death summons Circle 2 in upper/current/lower lanes at the same x, skipping missing lanes |
| Triangle 1 | 30 | 5000 | 100 | 600 | ◆ | Body label `I`; average speed `15` |
| Triangle 2 | 90 | 5000 | 100 | 600 | ◆ | Body label `II`; average speed `20`, +`5` over Triangle 1; attacks every `0.5s` |
| Triangle 3 | 150 | 5000 | 100 | 600 | ◆ | Body label `III`; average speed `25`, +`10` over Triangle 1; attacks every `0.33s` |
| Triangle Ram 1 | 75 | 5000 | 200 | 1400 | ◆ | Body label `I/I`; base average speed `15`, uniformly accelerates while moving and reaches `60` after `7` cells. The first time it is blocked, it rams the blocker for physical damage. When it dies for any reason, it spawns two Triangle 1 enemies slightly ahead/behind |
| Triangle Ram 2 | 225 | 5000 | 200 | 1400 | ◆ | Body label `II/II`; base average speed `20`, uniformly accelerates while moving and reaches `80` after `7` cells. The first time it is blocked, it rams the blocker for physical damage. When it dies for any reason, it spawns two Triangle 2 enemies slightly ahead/behind |
| Triangle Ram 3 | 375 | 5000 | 200 | 1400 | ◆ | Body label `III/III`; base average speed `25`, uniformly accelerates while moving and reaches `100` after `7` cells. The first time it is blocked, it rams the blocker for physical damage. When it dies for any reason, it spawns two Triangle 3 enemies slightly ahead/behind |
| Angel Pentagon Ram 1 | 320 | 5000 | 200 | 1400 | ✦ | Body label `I/I`; MR `40`; base average speed `15`, uniformly accelerates like Triangle Ram and reaches `60` after `7` cells. Does not naturally appear before Flag 1. Its body is two face-linked pentagons. The first time it is blocked, it deals no damage and gains `2s` Flying with a halo. After that effect has triggered, the next block rams for magic damage, disappears, and spawns a same-rank Angel Pentagon in the forward position plus a same-rank Pentagon in the rear position |
| Angel Pentagon Ram 2 | 640 | 5000 | 200 | 1400 | ✦ | Body label `II/II`; MR `40`; base average speed `20`, uniformly accelerates like Triangle Ram 2 and reaches `80` after `7` cells. Same Flying-then-ram behavior as Angel Pentagon Ram 1. On death, spawns Angel Pentagon 2 ahead and Pentagon 2 behind |
| Angel Pentagon Ram 3 | 960 | 5000 | 200 | 1400 | ✦ | Body label `III/III`; MR `40`; base average speed `25`, uniformly accelerates like Triangle Ram 3 and reaches `100` after `7` cells. Same Flying-then-ram behavior as Angel Pentagon Ram 1. On death, spawns Angel Pentagon 3 ahead and Pentagon 3 behind |
| Inverted Triangle 1 | 50 | 1000 | 70 | 2000 | ✦ | Body label `I`; MR `60`; average speed `40`; after being blocked by the same tower for `2s`, disappears and detonates against that tower |
| Inverted Triangle 2 | 100 | 1000 | 70 | 2600 | ✦ | Body label `II`; MR `60`; average speed `45`; after being blocked by the same tower for `2s`, disappears and detonates against that tower |
| Inverted Triangle 3 | 150 | 1000 | 70 | 3200 | ✦ | Body label `III`; MR `60`; average speed `50`; after being blocked by the same tower for `2s`, disappears and detonates against that tower |
| Shooting Triangle 1 | 50 | 2000 | 70 | 400 | ◆ | Body label `I`; average speed `4`; points toward the base and fires red-tinted bolts every `2s` |
| Shooting Triangle 2 | 100 | 2000 | 70 | 400 | ◆ | Body label `II`; average speed `4`; points toward the base and fires 2 red-tinted bolts every `2s`; volley window is fixed at one fifth of its attack interval |
| Shooting Triangle 3 | 150 | 2000 | 70 | 400 | ◆ | Body label `III`; average speed `4`; points toward the base and fires 3 red-tinted bolts every `2s`; volley window is fixed at one fifth of its attack interval |
| Triangle Mortar 1 | 90 | 1500 | 70 | 1150 | ◆ | Body label `I/I`; MR `0`; average speed `5.5`; every `15s`, fires a shell-like physical mortar with `3x3` AOE at the tower blocking the most enemies. Ties target the later-placed tower. N rewrites the landing point if targeted; R takes damage and reflects a matching mortar back at the shooter |
| Triangle Mortar 2 | 180 | 1500 | 70 | 1150 | ◆ | Body label `II/II`; MR `0`; average speed `5.5`; every `15s`, fires 2 shell-like physical mortars with `3x3` AOE. The volley window is fixed at one fifth of its attack interval, so the two shots are `3s` apart |
| Triangle Mortar 3 | 270 | 1500 | 70 | 1150 | ◆ | Body label `III/III`; MR `0`; average speed `5.5`; every `15s`, fires 3 shell-like physical mortars with `3x3` AOE. The volley window is fixed at one fifth of its attack interval |
| Pentagon 1 | 120 | 1500 | 70 | 800 | ✦ | Body label `I`; MR `40`; average speed `5.5`; downward-facing pentagon. Every `15s`, fires a red `#` magic mortar with `3x3` AOE. If blocked, targets its blocker; otherwise targets the most recently placed tower on the field, ignoring level. N rewrites the landing point if targeted; R takes damage and reflects a matching mortar back at the shooter |
| Pentagon 2 | 240 | 1500 | 70 | 800 | ✦ | Body label `II`; MR `40`; average speed `5.5`; same as Pentagon 1, but fires 2 red `#` magic mortars per attack. The volley window is fixed at one fifth of its attack interval |
| Pentagon 3 | 360 | 1500 | 70 | 800 | ✦ | Body label `III`; MR `40`; average speed `5.5`; same as Pentagon 1, but fires 3 red `#` magic mortars per attack. The volley window is fixed at one fifth of its attack interval |
| Angel Pentagon 1 | 200 | 1200 | 50 | 300 | ◆ | Body label `I`; MR `20`; average speed `20`; point faces downward and it has a small halo. Does not naturally appear before Flag 1. Wings: starts at `0/15` SP, gains `1` SP/s, then gives itself and enemies in a centered `3x3` area Flying with a halo and `+100%` movement speed for `3s`; SP regeneration pauses while Wings is active |
| Angel Pentagon 2 | 250 | 1200 | 50 | 300 | ◆ | Body label `II`; MR `20`; average speed `20`; otherwise identical to Angel Pentagon 1, but Wings starts at `2/15` SP and gains `1.2` SP/s |
| Angel Pentagon 3 | 300 | 1200 | 50 | 300 | ◆ | Body label `III`; MR `20`; average speed `20`; otherwise identical to Angel Pentagon 1, but Wings starts at `4/15` SP and gains `1.4` SP/s |
| Shooting Pentagon 1 | 125 | 2000 | 70 | 150 | ✦ | Body label `I`; MR `40`; average speed `4`; one point faces the base. Every `4s`, fires an instant red magic laser. The laser is not a projectile, cannot be reflected by R, pierces towers in its lane, and stops after damaging the first tower with MR greater than `0` |
| Shooting Pentagon 2 | 250 | 2000 | 70 | 150 | ✦ | Body label `II`; MR `40`; average speed `4`; same as Shooting Pentagon 1, but fires 2 instant red magic lasers per attack. The volley window is fixed at one fifth of its attack interval |
| Shooting Pentagon 3 | 375 | 2000 | 70 | 150 | ✦ | Body label `III`; MR `40`; average speed `4`; same as Shooting Pentagon 1, but fires 3 instant red magic lasers per attack. The volley window is fixed at one fifth of its attack interval |
| Diamond 1 | 100 | 2000 | 70 | 400 | ✦ | Body label `I`; MR `40`; average speed `4`; fires red `*` magic projectiles every `2s`; does not naturally appear before Flag 1 |
| Diamond 2 | 200 | 2000 | 70 | 400 | ✦ | Body label `II`; MR `40`; average speed `4`; fires 2 red `*` magic projectiles every `2s`; volley window is fixed at one fifth of its attack interval; does not naturally appear before Flag 1 |
| Diamond 3 | 300 | 2000 | 70 | 400 | ✦ | Body label `III`; MR `40`; average speed `4`; fires 3 red `*` magic projectiles every `2s`; volley window is fixed at one fifth of its attack interval; does not naturally appear before Flag 1 |
| Hexagon 1 | 160 | 18000 | 150 | 400 | ◆ | Body label `I`; MR `20`; average speed `5`; melee attack every `1s`; flat side faces the base. Enemies within `1.4` cells, including itself, and Bosses touching that aura gain Armor: `+50` armor per Hexagon 1 aura, stacking additively and shown as `⬡` on ordinary enemies. Gains `1` SP/s up to `20`; at full SP, heals the lowest HP% damaged enemy within `1.4` cells for `30%` of Hexagon max HP, consuming `20` SP |
| Hexagon 2 | 240 | 18000 | 150 | 400 | ◆ | Body label `II`; MR `20`; average speed `5`; melee attack every `1s`; flat side faces the base. Same Armor aura and healing behavior as Hexagon 1, but its aura grants `+80` armor |
| Hexagon 3 | 320 | 18000 | 150 | 400 | ◆ | Body label `III`; MR `20`; average speed `5`; melee attack every `1s`; flat side faces the base. Same Armor aura and healing behavior as Hexagon 1, but its aura grants `+110` armor |
| Charging Hexagon 1 | 150 | 12000 | 150 | 500 | ✦ | Body label `I`; MR `40`; average speed `25`; point faces the base. Melee magic attack every `2s`. Enemies in the same lane and farther from the base gain a non-stacking `+50%` movement speed bonus |
| Charging Hexagon 2 | 300 | 12000 | 150 | 500 | ✦ | Body label `II`; MR `40`; average speed `25`; point faces the base. Same speed aura as Charging Hexagon 1, but melee magic attack is every `1s` |
| Charging Hexagon 3 | 450 | 12000 | 150 | 500 | ✦ | Body label `III`; MR `40`; average speed `25`; point faces the base. Same speed aura as Charging Hexagon 1, but melee magic attack is every `0.67s` |
| Hex Mace 1 | 375 | 9000 | 150 | 400 | ◆ | Body label `I/I`; MR `0`; base average speed `20`; does not naturally appear before Flag 1. Shape is two edge-linked hexagons. It starts at `0` current velocity, continuously accelerates toward its facing direction, and reaches `80` after `7` cells. When blocked, it does not self-destruct: it deals collision damage based on current actual speed (`10` speed = `100%` attack, `20` speed = `200%`, `30` speed = `300%`, etc.), then bounces away by reflecting its current velocity while keeping its facing direction. On death, it spawns Charging Hexagon 1 ahead of its facing direction and Hexagon 1 behind |
| Hex Mace 2 | 500 | 9000 | 150 | 460 | ◆ | Body label `II/II`; MR `0`; base average speed `20`; does not naturally appear before Flag 1. Same ramming behavior as Hex Mace 1. On death, it spawns Charging Hexagon 2 ahead of its facing direction and Hexagon 2 behind |
| Hex Mace 3 | 625 | 9000 | 150 | 520 | ◆ | Body label `III/III`; MR `0`; base average speed `20`; does not naturally appear before Flag 1. Same ramming behavior as Hex Mace 1. On death, it spawns Charging Hexagon 3 ahead of its facing direction and Hexagon 3 behind |
| Square 1 | 50 | 12000 | 300 | 400 | ◆ | Body label `I`; average speed `6` |
| Square 2 | 150 | 12000 | 600 | 400 | ◆ | Body label `II`; average speed `6` |
| Square 3 | 250 | 12000 | 900 | 400 | ◆ | Body label `III`; average speed `6` |
| Trapezoid 1 | 70 | 12000 | 100 | 400 | ◆ | Body label `I`; MR `80`; average speed `10`; attacks every `1s` |
| Trapezoid 2 | 120 | 12000 | 100 | 400 | ◆ | Body label `II`; MR `90`; average speed `10`; attacks every `1s` |
| Trapezoid 3 | 170 | 12000 | 100 | 400 | ◆ | Body label `III`; MR `100`; average speed `10`; attacks every `1s` |

Damage symbols: `◆` physical, `✦` magic, `◇` true. Magic-damage projectiles and related hit effects use light blue.
Effect symbols: `Aa` character production, `♡` healing.
Character resources use layered softcaps. Raw resources above `9999` apply one smooth `p=0.7` softcap layer. Above `99999`, the already-softcapped effective value receives a second `p=0.7` layer. Above `999999`, it receives a third layer, and later decade thresholds keep adding one more identical layer. This keeps marginal gains decreasing as raw resources grow. When softcapped, the HUD shows effective resources with raw resources in parentheses.
Attack speed `x` means one attack every `60 / x` seconds. Attack speeds below `1` are capped to `1`; units with no attack speed do not attack. Zeal is a tower effect from e that grants +35% attack speed and does not stack.
Stasis gives enemies a blue border and reduces their movement speed by `30%` (to `70%`). Haste gives enemies light-blue wind trails and raises movement speed to `200%` unless specified otherwise. Power gives enemies a red `!` icon and increases outgoing attack damage by `30%` without changing their base attack stat.
Sunder gives enemies a white `▣` icon and reduces final armor by `50%`; repeated applications refresh its duration.
Armor from Hexagons gives ordinary enemies a `⬡` icon and stacks additively as bonus armor. Bosses also gain the bonus armor while their hitbox is within a Hexagon aura.
Charging Hexagon speed aura is dynamic, non-stacking, and multiplies with other speed modifiers.
Triangle enemies all deal Triangle 1's `600◆`; Triangle N attacks every `1/N` seconds.
Shooting Triangle is a separate ranged enemy and does not use Triangle N attack scaling.
Locked attacks, including Triangle Mortars, target the tower blocking the attacker if the attacker is currently blocked; otherwise they use their normal targeting rule.
Flying units cannot be blocked by grounded towers and render slightly higher than grounded enemies. Flying itself does not always show a halo; Wings-granted Flying shows a halo. Flying towers do not block grounded enemies, but can block regular Flying enemies.
High Flight is a separate airborne state used by Slope Triangle launches and Archangel Heptagon's spawn boost. High Flight enemies cannot be blocked, targeted, directly hit, or damaged by tower AOE until they land or the boost ends.
Enemies with a minimum flag gate are excluded from random wave pools before that flag wave. All Diamonds, Triangle Mortars, Pentagons, Angel Pentagons, Shooting Pentagons, Hex Maces, and Angel Pentagon Rams require Flag 1, so they can start appearing on wave 10 of standard 10-wave flags.
Numbered minion weights use fixed additive steps: circles `+40`, triangles `+60`, squares `+100`, Angel Pentagon Rams `+320`, Pentagons `+120`, Angel Pentagons `+50`, Shooting Pentagons `+125`, Diamonds `+100`, Hexagons `+80`, Charging Hexagons `+150`, Hex Maces `+125`, Trapezoids `+50`, Inverted Triangles `+50`, Shooting Triangles `+50`, Triangle Rams `+150`, Triangle Mortars `+90`.
Enemy body labels are displayed as Roman numerals in-game.
Mirage Sun Bomb is a Boss-only Octahedron mechanic with weight `0`, HP `12000`, Armor `0`, MR `0`, average speed `90`, and `900` true collision damage. Its larger sun-shaped body rotates and does not shrink with HP. Above `50%` HP, it takes only `5%` magic damage before difficulty reduction; below `50%`, it takes only `5%` physical damage instead and its border turns light blue. At `0` HP, it locks at `1` HP, turns gold, and becomes invincible. Gold depleted bombs gain weak `4 px/s²` acceleration toward the nearest currently invincible Boss body, if one exists. Colliding with towers or Bosses bounces it, shows small gold true-damage collision particles, and deals `900` true damage to the collision target; it passes through non-Boss enemies without colliding or bouncing. Tower hits bounce it away from the attacking tower position, independent of projectile angle or speed. It ignores mechanics that do not affect leaders, such as Burrow Arrow loading, Heart Lead pulling, and Slope Triangle launching.

## Leader Fixed Spawns

| Enemy | Spawn Rule | HP | Armor | Attack | DMG | Notes |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Heart 1 | 1 per flag wave if included in the level pool; no wave weight | 9999 | 299 | 2100 | True | Body label `I`; MR `60`; fixed speed `30` with no random speed variance. Enemies in the same lane and farther from the base gain a non-stacking `+50%` movement speed bonus. Every `5s`, emits a growing pink heart AOE centered on itself with `1.75` cell radius and outward falloff. Lead starts at `0/5` SP, gains `1` SP/s, then pulls ordinary minions in its column plus four columns behind, within one lane up/down, into its lane; leaders, Bosses, and Boss companions are not pulled |
| Heart 2 | 1 per flag wave if included in the level pool; no wave weight | 9999 | 299 | 3000 | True | Body label `II`; MR `60`; otherwise identical to Heart 1 |
| Heart 3 | 1 per flag wave if included in the level pool; no wave weight | 9999 | 299 | 3900 | True | Body label `III`; MR `60`; otherwise identical to Heart 1 |
| Burrow Arrow 1 | 1 per flag wave if included in the level pool; no wave weight | 16500 | 250 | 400 | Physical | Body label `I`; MR `0`; fixed speed `20` with no random speed variance. Touching non-leader minions are loaded; rank I can carry total minion rank `5`. Once full or after `6s` on the field, it burrows, shows only its upper tip about `0.55` cells lower, ignores normal projectile targeting/direct hits, but can still be damaged by AOE. While burrowed it gains `+300%` movement speed. It resurfaces at the center of the cell before the base, turns itself and loaded enemies around, unloads once, and can no longer load or burrow. If it dies while carrying loaded enemies, they immediately appear without reversing direction |
| Burrow Arrow 2 | 1 per flag wave if included in the level pool; no wave weight | 16500 | 250 | 400 | Physical | Body label `II`; MR `0`; fixed speed `20` with no random speed variance. Otherwise identical to Burrow Arrow 1, but can carry total minion rank `10` |
| Burrow Arrow 3 | 1 per flag wave if included in the level pool; no wave weight | 16500 | 250 | 400 | Physical | Body label `III`; MR `0`; fixed speed `20` with no random speed variance. Otherwise identical to Burrow Arrow 1, but can carry total minion rank `15` |
| Slope Triangle 1 | 1 per flag wave if included in the level pool; no wave weight | 21000 | 500 | 0 | Physical | Body label `I`; MR `0`; fixed speed `10` with no random speed variance. It does not attack. While currently blocked, it stays in place and acts as a ramp; if unblocked, it keeps moving at its own speed. Only while blocked, touching non-leader minions whose current velocity direction matches the Slope Triangle facing direction enter High Flight and fly forward in a parabola. This checks the minion velocity direction, not the minion facing direction. Flight distance is based on current actual speed: every `10` speed sends the minion `1.5` cells. High Flight enemies cannot be blocked, targeted, directly hit, or damaged by tower AOE before landing. Leaders, Bosses, and Boss companions are not launched |
| Slope Triangle 2 | 1 per flag wave if included in the level pool; no wave weight | 21000 | 500 | 0 | Physical | Body label `II`; MR `0`; fixed speed `15` with no random speed variance. Otherwise identical to Slope Triangle 1 |
| Slope Triangle 3 | 1 per flag wave if included in the level pool; no wave weight | 21000 | 500 | 0 | Physical | Body label `III`; MR `0`; fixed speed `20` with no random speed variance. Otherwise identical to Slope Triangle 1 |
| Archangel Heptagon 1 | 1 per flag wave if included in the level pool; no wave weight | 4000 | 50 | 1400 | Magic | Body label `I`; MR `20`; fixed speed `30` with no random speed variance. It is always Flying, attacks every `2s`, dealing `100%` attack as magic damage, and has two visual halos. For the first `3s` after spawning, it has `+150%` movement speed and High Flight. It does not gain extra Flying halos from other skills or minions; incoming Flying effects become High Flight instead, turning its own two halos gold. Ascension: starts at `10/15` SP, gains `1` SP/s, then gives itself and enemies within a `2.5` cell radius Flying with a halo and `+100%` movement speed for `6s`; SP regeneration pauses while Ascension is active |
| Archangel Heptagon 2 | 1 per flag wave if included in the level pool; no wave weight | 6000 | 50 | 1400 | Magic | Body label `II`; MR `20`; fixed speed `30` with no random speed variance. Otherwise identical to Archangel Heptagon 1, including Ascension gaining `1` SP/s |
| Archangel Heptagon 3 | 1 per flag wave if included in the level pool; no wave weight | 8000 | 50 | 1400 | Magic | Body label `III`; MR `20`; fixed speed `30` with no random speed variance. Otherwise identical to Archangel Heptagon 1, including Ascension gaining `1` SP/s |
| Hex Spell Bulwark 1 | 1 per flag wave if included in the level pool; no wave weight | 24000 | 100 | 1200 | Magic | Body label `I/I`; MR `80`; fixed speed `15` with no random speed variance. Attacks once per second, dealing `100%` attack as magic damage. Its body is a vertical Hex Mace. Enemies in the same lane, including itself, gain additive `+40` MR; multiple bulwarks stack. Affected enemies show a light-blue hexagon icon |
| Hex Spell Bulwark 2 | 1 per flag wave if included in the level pool; no wave weight | 24000 | 100 | 1200 | Magic | Body label `II/II`; MR `80`; fixed speed `15` with no random speed variance. Same as Hex Spell Bulwark 1, but its same-lane MR aura grants additive `+50` MR |
| Hex Spell Bulwark 3 | 1 per flag wave if included in the level pool; no wave weight | 24000 | 100 | 1200 | Magic | Body label `III/III`; MR `80`; fixed speed `15` with no random speed variance. Same as Hex Spell Bulwark 1, but its same-lane MR aura grants additive `+60` MR |

Leader enemies are fixed flag-wave spawns when included in a level pool. They do not consume wave weight and do not receive random speed variance.

## Bosses

| Boss | HP | Armor | MR | Speed | Hitbox | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Cube I | 150000 | 300 | 20 | 0.6 | `2.95x2.95` cells | Appears at combat start. Does not shrink from damage. Killing it clears the level; reaching the base fails the level. Deals `2000◆` every `0.5s` to all touching towers at once, with a following cube-collapse effect on each target. |
| Cube II | 200000 | 600 | 20 | 0.6 | `2.95x2.95` cells | Advance summons same-rank Squares. One Promotion skill, prioritizing rank II targets before rank I. Further endless ranks add 50000 HP and 300 armor each. |
| Tetrahedron I | 120000 | 150 | 20 | 1.2 | `2.95x2.95` cells | Fast-attack Boss with quicker visual rotation. Same baseline behavior as Cube I, but uses tetrahedron-collapse effects. At first `50%` HP or lower, summons Inverted Triangle 1 in every cell of the two columns farthest from the base and immediately fills Charge SP. At first `10%` HP or lower, its HP is held at `10%`, gains `15s` Invincible, gains `60s` Boss Haste at `300%` speed, summons Inverted Triangle 1 in every cell of the five columns farthest from the base, and permanently doubles all skill natural SP gain. If it would die before this triggers, it instead locks at `1` HP and triggers the same effect package. |
| Tetrahedron II | 120000 | 150 | 20 | 1.2 | `2.95x2.95` cells | Same baseline behavior as Tetrahedron I. All Inverted Triangles and Shooting Triangles summoned by its Boss mechanics are rank II. |
| Dodecahedron I | 100000 | 200 | 90 | 0.6 | `2.95x2.95` cells | Whiteboard Boss. Same baseline behavior as Cube I, but has no SP skills. Starts with 3 orbiting Dodecahedron Companions. While any companion is alive, it gains `95%` all-damage reduction; the reduction is removed after all companions die. |
| Dodecahedron II | 100000 | 200 | 90 | 0.6 | `2.95x2.95` cells | Same baseline behavior as Dodecahedron I, but starts with 3 Dodecahedron Companion II enemies. While any companion is alive, it gains `95%` all-damage reduction. When its first companion dies, death-laser volleys increase from `7` to `14`; when its second companion dies, death mortars select up to `4` targets, unchanged from I. |
| Dodecahedron Companion | 32000 | 2000 | 40 | orbiting | `0.95x0.95` cells | Special Boss companion. Body label `I`; cannot be blocked, syncs Dodecahedron I's 3D rotation, and shrinks visually with HP like ordinary enemies. Attack loop: after `20s`, fires `4 x label` Shooting-Pentagon lasers; after `30s`, fires `2 x label` Pentagon mortars; after `30s`, casts Angel-Pentagon Wings on enemies in a `3x3` area. Motion loop: orbits for `47s`, shifts over `1s` to the front column on the Boss lane / two lanes up / two lanes down, holds `47s`, then shifts back over `1s`. Each companion death gives surviving companions `10s` Invincible. |
| Dodecahedron Companion II | 40000 | 2000 | 40 | orbiting | `0.95x0.95` cells | Body label `II`; same behavior as Dodecahedron Companion I, but HP is `25%` higher and all volley shot counts are doubled: `8` Shooting-Pentagon lasers and `4` Pentagon mortars. |
| Octahedron I | 120000 | 200 | 60 | 0.6 | `2.95x2.95` cells | Multi-body Boss for 4-10. Same contact behavior as Cube I, but has no SP skills. At `75%`, `50%`, and `25%` HP thresholds, spawns an additional Octahedron body. All bodies share one HP bar; each body keeps independent effects and movement. Each new invincibility cycle spawns two Mirage Sun Bombs from the rightmost column in rows 2 and 6. |
| Octahedron II | 170000 | 200 | 60 | 0.6 | `2.95x2.95` cells | Same as Octahedron I, but its `25%` reinforcement sequence summons rank-2 leaders instead of rank-1 leaders. |
| Icosahedron I | phased | phase | phase | 0.5 | `4.95x4.95` cells | Chapter 5 finale Boss. Same baseline contact/base behavior as Cube I. In 5-10, Phase 1 has `300000` HP, Cube-style `300` armor / `20` MR, `70%` all-damage reduction, and three SP skills. Phase 2 has `200000` HP, Tetrahedron-style `150` armor / `20` MR, `50%` all-damage reduction, and uses a Tetrahedron II-style skill kit plus Leap; all summons are rank III, its 50% burst summons 5 columns, its 10% invincible burst summons every grid cell, and Leap summons Slope Triangle 3 in the column farthest from the base. Phase 3 has `300000` HP, Dodecahedron-style `200` armor / `90` MR, `70%` baseline all-damage reduction, and uses the 5-5 enemy family expanded to rank I/II/III where available, while leader enemies in the fight use rank III. Phase 3 starts with seven rank-I Icosahedron-shaped companions; while any companion lives, Icosahedron gains `95%` extra all-damage reduction. Companion deaths alternate between 15 five-lane laser volleys over `10s` and up to 6 latest-target mortars; each death gives surviving companions `10s` Invincible, and killing all companions unlocks Endless Wings. Phase 4 has Octahedron-style `200` armor / `60` MR, a gold final HP bar, `300000` HP, Octahedron-style shared-HP bodies and body-count damage reduction, no threshold invincibility or Mirage Sun Bombs, and a first-lethal-hit lock to `1` HP with `15s` all-body Invincible plus one extra Icosahedron spawned at column 2 row 3 moving downward. 5-10 wave pools ignore enemy minimum flag requirements. |
| Small Stellated Dodecahedron I | 100000 | 200 | 90 | 0.6 | `2.95x2.95` cells | Whiteboard Boss. Same contact/base behavior as Cube I, currently used to test the small stellated dodecahedron wireframe. |

Cube skills:

- Each skill has independent SP.
- All skills can only activate at full SP.
- Promotion: starts at `0/90` SP, gains `1` SP per second, max `90`.
- At full SP, consumes `30` SP and promotes 3 ordinary enemies by one rank. Eligible ranks are at most the Boss rank; prioritize highest rank, then nearest distance. Fewer than 3 eligible targets holds at full SP. High-flying enemies are excluded; circles cannot exceed IV.
- Promotion creates a cube-collapse effect on the target.
- Cube II has no second Promotion skill; its single Promotion can mix rank II and rank I targets.
- Advance: starts at `0/120` SP, gains `1` SP per second, max `120`.
- At full SP, consumes `120` SP and summons one Square matching the Boss rank in every lane, one cell in front of its hitbox.

Dodecahedron mechanics:

- When the first companion dies, Dodecahedron I fires Shooting-Pentagon lasers across its own 3 occupied lanes, `7` volleys total. Dodecahedron II fires `14` volleys instead.
- When the second companion dies, every Dodecahedron rank selects up to `4` most recently placed towers, then fires one magic Pentagon mortar at each in order. The target count is fixed in both story and endless battles.
- While any companion is alive, Dodecahedron I/II gains `95%` all-damage reduction. After all companions die, this reduction is removed and Endless Wings starts charging.
- Endless Wings: starts at `0/4` SP, gains `1` SP per second after all companions are dead, and consumes `4` SP at full.
- On activation, Endless Wings gives `7s` Wings Flying to all currently non-flying enemies touching Dodecahedron I's hitbox, with the same `+100%` movement speed as Angel Pentagon 1 Wings.

Octahedron mechanics:

- All Octahedron bodies can be targeted and damaged. Damage to any body subtracts from the same Boss HP bar.
- Effects are not shared between bodies. A hit resolves defense and temporary effects on the body that was hit.
- At first `75%` HP or lower, spawns a second Octahedron inside the grid at the base-side middle. It moves in the opposite horizontal direction and cannot trigger base defeat.
- At first `50%` HP or lower, spawns a third Octahedron inside the grid at the top of the 8th column from the left, moving downward.
- At first `25%` HP or lower, spawns a fourth Octahedron inside the grid at the bottom of the 5th column from the left, moving upward.
- Only Octahedron bodies moving toward the base can trigger defeat by crossing the base line.
- When `2` / `3` / `4` Octahedron bodies exist, all Octahedron bodies gain an additional independent `20%` / `40%` / `60%` all-damage reduction.
- At combat start and each time a new Octahedron body appears, every Octahedron body becomes invincible and rows 2 and 6 each spawn one Mirage Sun Bomb in the rightmost column, moving left.
- When the `25%` Octahedron body appears, it also starts a reinforcement sequence from the normal spawn side: immediately one Hex Spell Bulwark in every row; after `0.5s`, one Burrow Arrow in rows 2, 4, and 6; after another `0.5s`, one Heart in rows 2, 4, and 6; after another `0.5s`, one Slope Triangle in every row; after another `0.5s`, one Archangel Heptagon in every row. Octahedron II uses the rank-2 versions of all these leaders.
- A gold, depleted Mirage Sun Bomb that collides with an invincible Octahedron body removes invincibility from only the body it hit, deals its collision damage, deals `2900` true damage in a `2.6`-cell radius to towers, enemies, and Boss bodies in range, and then disappears immediately.

Tetrahedron skills:

- Charge: starts at `0/60` SP, gains `1` SP per second, max `60`.
- At full SP, consumes `30` SP and gives ordinary enemies `7s` Haste.
- Haste makes affected enemies move at `200%` speed and shows light-blue wind trails. Tetrahedron II Charge uses `250%` speed instead.
- Using Charge gives Suppression `+15` SP.
- Impact: starts at `0/120` SP, gains `1` SP per second, max `120`.
- At full SP, consumes `60` SP and summons Inverted Triangle 1 in every lane across two columns in front of the Boss.
- Using Impact gives Charge `+10` SP.
- Suppression: starts at `0/160` SP, gains `1` SP per second, max `160`.
- At full SP, consumes `40` SP and summons Shooting Triangle 1 in every lane at the normal spawn line.
- Using Suppression gives Impact `+20` SP.
- Last Stand: starts at `0/10` SP, max `10`, only gains `1` SP per second while Tetrahedron HP is at or below `50%`.
- At full SP, consumes `10` SP, gives permanent Power to all enemies touching the Boss hitbox, and gives Charge `+5` SP.
- Tetrahedron skills have no priority order; each skill that is full at the start of the skill check activates once. SP gained from a skill is checked on later updates.
- Tetrahedron II uses the same skill rules, but its half-HP, critical-HP, Impact, and Suppression summons use rank II Inverted/Shooting Triangles.
- After Tetrahedron's first `10%` HP trigger, all Tetrahedron skill natural SP gain is permanently doubled. This does not double SP granted directly by other skills.
- Tetrahedron attack and skill visuals use tetrahedron-collapse effects. Cube and tetrahedron collapse effects each start from a random 3D rotation.

## Character Attributes

Towers have separate base and final `attackPower`. Attack damage and healing use final ATK times the attack multiplier (default `100%`; r uses `500%`). Damage upgrades now raise ATK: d, x, Q, k, S, V, v, l and G gain `80%` of base ATK per effective upgrade, with the existing level softcap. Other upgrade effects are unchanged. B/w counterattacks use `100%` final ATK; fixed self-damage, h's max-HP healing, and R's reflected enemy damage keep their own rules. Projectiles snapshot their damage when fired.

| Character | Category | Border | Cost | CD | HP | Armor | MR | Main Effect | Upgrade |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A | Attack | Diamond | 50 | 1s | 1200 | 150 | 0 | Fires 1 bolt, `400◆`, every `2s` | +1 volley per level |
| a | Attack | Diamond | 15 | 1s | 1200 | 150 | 0 | Fires 1 bolt, `400◆`, every `2s`; range is self plus 4 cells ahead | +1 volley per level |
| B | Defense | Square | 75 | 20s | 3000 | 500 | 0 | Blocks; reflects `400◆` when hit by melee attacks | +`2400` max/current HP per level |
| b | Function | Triangle | 75 | 10s | 1200 | 150 | 0 | Instant turn card. Place it on an occupied tower; it occupies that cell briefly, then flips the target tower's facing. Reversed towers mirror their border/letter and show a yellow `<` marker. A reversed tower can be flipped again to return to normal | Each effective level refunds `(level - 1) / level` of b's cooldown after it resolves |
| C | Attack | Diamond | 250 | 3s | 1200 | 150 | 0 | Fires 1 shell, `500◆`, `1.75` tile radius AOE with distance falloff, every `3s` | +1 volley per level |
| c | Function | Triangle | 1425 | 50s | 1200 | 150 | 0 | Speed Clock: gains `1` SP/s, max `20`; at full SP gains a border. Clicking a ready c spends all SP and makes it flash for `10s`; active c towers make other card-slot cooldown speed `(active c level sum + 1)x` only for cards with base cost `999` or lower; c's own card cooldown is not accelerated by this effect. Shift-click a ready c activates all ready c towers | Skill contribution uses its current level |
| D | Defense | Square | 100 | 20s | 3000 | 800 | 0 | High-armor blocker | +`2400` max/current HP per level |
| d | Attack | Diamond | 175 | 10s | 1200 | 150 | 20 | Fires a light-blue piercing magic laser, `400✦`, every `3s`. The laser stops after hitting the first enemy with MR. Hit enemies gain `10s` Sunder, reducing final armor by `50%` and showing a white `▣` icon; repeated hits refresh Sunder to `10s` | +`320✦` attack per level |
| z | Attack | Diamond | 175 | 10s | 1200 | 150 | 20 | Unlock: clear `3-8`, the first Angel Pentagon stage. Same light-blue piercing magic laser as d: `400✦` every `3s`, stops after hitting the first enemy with MR. Successful hits remove `1 SP` from every existing skill of the target, including leaders but excluding Bosses, clamped to `0`. Boss damage is unchanged. Invincibility prevents drain. Preserves fractional recovery progress and active skills; no Sunder. | +`320✦` attack per level; SP drain stays `1` |
| O | Defense | Square | 125 | 20s | 3000 | 300 | 70 | High magic resistance with moderate armor | +`2400` max/current HP per level |
| o | Defense | Square | 175 | 20s | 3000 | 500 | 0 | Unlock: clear `2-8`, the first Mortar Triangle stage. ATK `0`, no retaliation. Orientation: starts at `0/10 SP`, recovers `1 SP/s`; click to spend `10 SP` for `6s`, pausing recovery. Redirects enemy attacks/skills targeting towers in the centered cornerless `5x5` area to itself, including airborne locked mortars. Untargeted shots, line lasers and AOE are unchanged. Pale green range when active, dim when idle. Most recently activated source wins overlaps without redirect chains. | +`2400` max/current HP per level; resets Orientation SP and active effect |
| R | Defense | Square | 225 | 15s | 3000 | 350 | 35 | Enemy projectiles still damage it, then reflect into friendly projectiles with the same damage and damage type. Locked mortars that hit R are reflected back at the shooter | +`2400` max/current HP per level |
| X | Production | Circle | 50 | 1.5s | 1200 | 150 | 0 | Produces `25` chars every `10s` using attack speed, shown as `Aa`; Zeal speeds this up | +`20` chars per production per level |
| x | Attack | Diamond | 575 | 10s | 1200 | 150 | 0 | Every `1s`, fires four fast accelerating `>` magic homing shots from the four attack-shape corners. Each shot deals `200✦`, reduced by `35%` against targets not Flying on impact, including ground Bosses; x locks the Flying enemy nearest to x when firing, or the enemy or Boss nearest to x if no Flying enemy exists. Shots only retarget after their target dies or disappears, then choose the nearest enemy or Boss to the shot regardless of Flying | +`160✦` projectile damage per level, before the non-Flying penalty |
| Y | Production | Circle | 125 | 8s | 2000 | 250 | 0 | Does not attack; produces `12` chars every time it is attacked | +80% base production per hit per level |
| E | Attack | Diamond | 150 | 2s | 1200 | 150 | 0 | Opens fire on targets in a forward fan (mirrored when reversed); fires 3 bolts at `-10/0/+10` degrees, `400◆` each, every `2s` | +1 volley per level |
| e | Healing | Hexagon | 650 | 20s | 1200 | 150 | 20 | Base AS `30` (`2s`): heals every damaged tower in the same centered `5x5` no-corner range as T for `90`. The range is shown with a red border. Towers in range, including e itself, gain non-stacking Zeal: +35% attack speed | +1 healing volley per level |
| g | Healing | Hexagon | 425 | 20s | 1200 | 150 | 20 | Unlock: clear `3-8`. AS `30` (`2s`), ATK `90`; heals every damaged tower in its centered `3x3` area, including itself. Red range border. Grants Unyielding: negative HP allowance of `15% * effective g level * target base HP`, unaffected by the target's HP upgrades, strongest source only, no Zeal. The health bar keeps its total length; pale red reserve occupies the left portion. Reaching the negative limit or losing sufficient allowance causes normal death. u networks sum members' base-HP allowances and divide by u count; negative ratios survive network changes. | +1 healing volley per effective upgrade, like e; Unyielding increases by 15 percentage points per effective level |
| M | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts downward at `80/90/100` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| m | Function | Triangle | 1650 | 50s | 1200 | 150 | 60 | Mirror tower. If one side of m has a mirrorable tower and the opposite side is empty and deployable, creates a same-type, same-facing, same-level mirror there. Transient effect towers such as b / t can also mirror onto an already occupied opposite cell and apply their effect to that tower. Only towers with base cost `999` or lower can be mirrored. Mirror links form transitive networks; if one network member disappears, the full network disappears through the same event. If m disappears, the mirror networks adjacent to it are erased | Level N m continuously grants `+(N - 1)` effective levels to the full mirror networks adjacent to it |
| W | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts upward at `-100/-90/-80` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| w | Defense | Square | 175 | 20s | 3000 | 500 | 0 | Blocks and reflects `400◆` when hit by melee attacks like B. Air Patrol: starts at `8/10` SP, gains `1` SP/s only while inactive, flashes its border at full SP, and can be clicked to spend `10` SP for `6s` Flying with a halo. While flying, w does not block grounded enemies but can block regular Flying enemies; High Flight is never blocked | +`2400` max/current HP per level; resets Air Patrol SP |
| F | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy or Boss contact, or when clicked, disappears and emits `10` shockwaves; each deals `1400◆` in a `4x4` area | +`8` shockwaves per level |
| f | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy or Boss contact, or when clicked, disappears, deals no damage, and applies `10s` Stasis to all enemies on the field | +`8s` Stasis duration per level |
| i | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy contact, or when clicked, disappears and freezes all enemies in a `2.6` cell radius for `15s`. Frozen enemies cannot move, attack, or trigger skills; accumulated actual physical damage during Freeze breaks it early once it reaches half max HP. Frozen enemies show a square ice-blue border | +`12s` Freeze duration per level |
| l | Function | Triangle | 175 | 30s | 1200 | 150 | 40 | On enemy or Boss contact, or when clicked, disappears and deals `15000✦` once to a full-column area with `0.75` cells horizontal range. F, f, i, and l borders flash while ready to click | +`12000✦` per level |
| r | Function | Triangle | 275 | 30s | 1200 | 150 | 0 | ATK `200`; consumed on click or contact, dealing `500% ATK` (`1000` base) magic damage once in radius `1.8`, with a pink pulse. Successful hits apply Reversal. High Flight, burrowed and invincible targets are unaffected. Reversal temporarily flips horizontal facing for towers and enemies, without stacking flips. Unlocks after `3-5` | `5s` Reversal per effective level; damage does not scale with upgrades |
| G | Function | Triangle | 15 | 30s | 1200 | 150 | 0 | Arms after `15s`; on enemy or Boss contact, disappears and deals `15000✦` | +`12000✦` per level; resets arming |
| t | Function | Triangle | 925 | 10s | 1200 | 150 | 0 | Instant true-damage amplifier. Place it on an occupied tower; it briefly occupies that cell, then makes all damage dealt by the target tower become true damage. The target shows a gold ring outside the auto-upgrade ring | Each effective level grants `12s` duration and refunds cooldown like b |
| y | Function | Triangle | 3250 | 120s | 1200 | 150 | 0 | Erases a target and adds a fraction of base cost times permanent level to a shared pool. Excludes temporary levels; extractions accumulate. The next card costing at most `999` deploys `max(1, floor(pool / cost))` times and charges the full cost, then empties the whole pool. Failed deployments preserve the pool. Unlocks after `4-4` | Extraction rate starts at `50%`, adding `25` percentage points per level; cooldown remains `120s` |
| H | Healing | Hexagon | 150 | 20s | 1200 | 150 | 0 | Heals the lowest HP% damaged ally in a centered `3x3` area for `700`, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| h | Defense | Square | 175 | 20s | 3000 | 550 | 0 | Guardian: gains `1` SP/s, max `20`; when full, waits until itself or a tower in its centered `3x3` area is damaged, then spends `20` SP to heal itself and the lowest HP% damaged tower in that area for `40%` of h's max HP | +`2400` max/current HP per level |
| P | Healing | Hexagon | 125 | 20s | 1200 | 150 | 0 | Heals the lowest HP% damaged ally in a 3-lane area covering 3 rear columns, its column, and the next 4 columns for `250`, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| p | Healing | Hexagon | 225 | 20s | 1200 | 150 | 0 | Heals the three lowest HP% damaged allies in a centered `3x3` area for `250` each, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| I | Attack | Diamond | 50 | 2s | 1200 | 150 | 20 | Fires 1 `*` projectile, `400✦`, every `2s`; range is self plus 5 cells ahead | +1 volley per level |
| Q | Attack | Diamond | 175 | 4s | 1200 | 150 | 20 | Fires 1 `$` projectile, `400✦`, every `2s`; range is the full lane ahead. On hit, applies `Stasis` for `1s`, reducing ordinary enemy movement speed by `30%`; Bosses ignore this debuff | +`320✦` damage per level |
| J | Attack | Diamond | 200 | 4s | 1200 | 150 | 20 | Fires 1 `#` shell, `600✦`, `1.75` tile radius AOE with distance falloff, every `4s`; range is self plus 5 cells ahead | +1 volley per level |
| K | Attack | Diamond | 375 | 4s | 2500 | 300 | 0 | Slashes 1 target for `1800◆`, every `4s`; range is self plus 2 cells ahead | +1 volley per level |
| k | Attack | Diamond | 625 | 10s | 2500 | 300 | 40 | Every `1s`, releases an arc wave that deals `280✦` to all enemies in a `2x3+1` area: its column and next column across 3 lanes, plus one extra forward cell in its lane | +`224✦` attack per level |
| S | Attack | Diamond | 925 | 50s | 1200 | 150 | 40 | Active skill: Spell Mortar. Gains `1` SP/s, max `30`; at full SP gains a border. Click a ready S, or Shift-click to select all ready S, then click any board point to fire 3 arcing `S` shells at `0.5s` intervals. Each shell deals `5000✦` in a `3x3` area. Right-click or clicking UI cancels aiming | +`4000✦` per shell per level; resets SP |
| s | Attack | Diamond | 325 | 30s | 1200 | 150 | 20 | Base attack `0`; AS `3` (`20s`). Every attack, places a same-level `a` in the nearest empty cell in front if one exists. If s is turned, it searches the turned direction and the created a is also turned | Created a level equals s's current effective level |
| Z | Production | Circle | 175 | 4s | 2500 | 300 | 0 | Slashes 1 target for `400◆`, every `2s`; range is self plus 2 cells ahead. Each slash hit produces `Aa15` | +1 volley per level |
| L | Function | Triangle | 200 | 20s | 3000 | 200 | 0 | Every `1s`, shifts all enemies in upper/lower lanes within its column and the front column into its own lane; takes `400◇` per shifted enemy | +`2400` max/current HP per level |
| j | Function | Triangle | 225 | 20s | 3000 | 200 | 0 | Unlock: clear `2-6`. ATK `0`. Gathering: starts at `0/10 SP`, recovers `1 SP/s`; click to spend `10 SP` for `10s`, pausing recovery. Moves friendly bullets in the same-column cells one row above/below into its lane, taking `100` true self-damage per bullet, independent of hit count. Preserves damage, velocity and locked targets. Each bullet can be pulled again after `0.1s`, including by previous gatherers; multiple pulls on one bullet in the same frame all cancel without self-damage. Enemy bullets, lasers and mortar projectiles are unaffected. | +`2400` max/current HP per level; resets Gathering SP and active effect |
| # | Function | Triangle | 475 | 30s | 1200 | 150 | 0 | ASCII Expansion (@); unlocked after AE-1. ATK 0. Box Push: starts at 0/30 SP, recovers 1 SP/s. Select a cardinally adjacent tower to spend 30 SP and push the contiguous chain one cell over 0.5s. Does not move itself. Towers entering sealed cells or leaving the board are erased. Invalid selections cost no SP. | +0.5 SP/s per extra effective level; upgrading resets SP |
| @ | Function | Copied / Triangle | 1000 | 60s | 1200 | 150 | 0 | Unlocked after AE-2. Continuously copies the tower one cell ahead with base cost <=999, including ASCII characters; excludes instant targeted effect cards. Copies base stats, mechanics and border, retaining its own label, facing, card identity and HP ratio. No valid target means no additional ability. | Uses copied upgrade rules at its own effective level |
| = | Special | Edge | 50 | 1s | 0 | 0 | 0 | Unlocked after AE-3. Internal-edge connector; click cycles bidirectional, forward, backward and closed. No ammo storage or attackable body. | +25 shots/s flow per level; supports auto-upgrades |
| ! | Function | Triangle | 200 | 30s | 1200 | 150 | 0 | Unlocked after AE-5. Permanently enables free-aim regular attacks without enemies in range. No auto skills or target-required attacks; does not stack. | Remaining card cooldown becomes 30s / effective level after applying |
| () | Defense / Special | Parentheses | 275 | 20s | 3000 | 300 | 40 | Shares a cell with one ordinary tower. Receives its damage first, using shell defenses; the breaking hit does not spill through. | +80% base HP per effective upgrade |
| [] | Defense / Special | Square brackets | 275 | 20s | 3000 | 600 | 0 | Unlock: AE-8. Same protective layer as (); receives occupant damage with its own defenses, without overflow. Only one shell per cell: () and [] cannot stack or upgrade each other. | +80% base HP per effective upgrade |
| ? | Special | Target | 0 | 0s | 0 | 0 | 0 | Unlock: AE-6. Catalog values are placeholders: choose an unlocked regular tower at loadout selection; deployment cost and combat stats match that tower, card cooldown is doubled and independent. Deploys immediately as the target; can accompany the original card. Regular towers cost <=999, Super 1000-9999, Ultimate >=10000. | Uses target upgrade rules, including normal auto-upgrades; original and imitation cards can upgrade the same tower type |
| + | Function | Triangle | 500 | 10s | 1200 | 150 | 0 | Input-only healing outlet. Converts total incoming damage to healing at 5:1 in small e's range, without an aura outline. Fixed 25 payloads/s. | 128 local capacity per effective level, like -; upgrades retain stock |
| - | Function | Triangle | 500 | 10s | 1200 | 150 | 0 | Input-only interceptor. Local ammo cancels enemy bullets/mortars within radius 2.6, one shot per 0.1s. Spends 5 friendly damage per 1 enemy damage; retains leftovers. | 128 local capacity per effective level, like 0; upgrades retain stock |
| * | Function | Triangle | 500 | 10s | 1200 | 150 | 0 | Unlock: AE-7. Input-only magic shield outlet. Protects friendly towers including self in a centered 5x5 area without corners, respecting & topology. Spends 3 stored damage per 1 post-MR magic damage absorbed; partial reserves absorb partially. Multiple outlets contribute in placement order. Successful absorption briefly shows a blue halo shield. Does not affect physical/true damage or execute original payload effects. | 128 local capacity per effective level; upgrades retain stock without changing range or conversion |
| / | Function | Triangle | 500 | 10s | 1200 | 150 | 0 | Unlock: AE-7. Input-only physical shield outlet. Protects friendly towers including self in a centered 5x5 area without corners, respecting & topology. Spends 3 stored damage per 1 post-armor physical damage absorbed; partial reserves absorb partially. Multiple outlets contribute in placement order. Successful absorption briefly shows a white halo shield. Does not affect magic/true damage or execute original payload effects. | 128 local capacity per effective level; upgrades retain stock without changing range or conversion |
| 0 | Function | Triangle | 50 | 3s | 1200 | 150 | 0 | Unlocked after AE-3. Buffers 128 real ordinary projectiles per effective level and automatically forwards through adjacent pipes. | +128 capacity per level; retains stock, supports auto-upgrades and extraction batches |
| & | Function | Triangle | 4200 | 120s | 1200 | 150 | 0 | Unlocked after AE-4. After placement select a different empty/occupied cell. Swaps the logical cells for tower-to-tower relations, including friendly ranges, mirrors, copying, equations and tower generation. Physical combat is unchanged. Swaps compose in activation order and disappear with their &. | +80% base HP per effective upgrade |
| 1 | Function | Triangle | 50 | 3s | 1200 | 150 | 0 | Unlocked after AE-3. Input-only outlet: waits for exactly n shots, then fires them together. Never forwards through pipes. Retains damage, hit counts, spread and range. | Manual number +1 raises required batch size, not damage; no auto-upgrades |
| N | Defense | Square | 125 | 20s | 3000 | 500 | 0 | Every `1s`, pushes all enemies it is blocking `5` cells in its push direction: normal N pushes left, reversed N pushes right. Takes `400◇` per pushed enemy. Enemy projectiles that would hit N are shifted `5` cells in that same direction instead of dealing projectile damage, and N takes `400◇` per shifted projectile. Locked mortar shots targeting N have their landing point shifted by the same distance and also cost N `400◇` once | +`2400` max/current HP per level |
| q | Defense | Square | 200 | 20s | 3000 | 500 | 0 | ATK `0`; every `1s`, stores all enemies it is blocking for `5s`, taking `400` true self-damage per enemy. Stored enemies cannot act or be attacked and still count toward remaining enemies. Release is one cell behind q's current position and facing, or its last position if removed. Does not store projectiles. Unlocks after `2-1` | +`2400` max/current HP per effective upgrade |
| n | Function | Triangle | 375 | 20s | 3000 | 200 | 0 | Every `1s`, repels all enemies in its own lane within its column and the front column to an adjacent upper/lower lane; odd placement order starts upward, even starts downward, then alternates. Takes `400◇` per shifted enemy | +`2400` max/current HP per level |
| T | Function | Triangle | 650 | 50s | 4000 | 150 | 20 | Every `1s`, takes `700◇`; ordinary units and projectiles in a centered `5x5` no-corner area move at `1/6` speed. Bosses ignore the slow. The area is shown with a deep-purple time border. Whenever it disappears for any reason, clears all projectiles and mortars in that area | +`3200` max/current HP per level |
| U | Function | Triangle | 1275 | 50s | 1200 | 150 | 40 | Grants towers in a centered `3x3` area, excluding itself, bonus levels equal to U's real level. Only affects towers with base cost `999` or lower. Multiple U auras stack additively | Each level raises U's aura bonus by `+1` level |
| V | Attack | Diamond | 775 | 6s | 1200 | 150 | 40 | Every `2s`, lobs a single-target `*` magic shell for `1700` damage along its lane. Prioritizes ranged enemies (shooters, lasers and mortars), then highest final attack, then nearest target. Predicts the landing point from target speed at lock time and can miss | +`1360` magic attack per level |
| v | Attack | Diamond | 500 | 6s | 1200 | 150 | 40 | ATK `350`; every `4s`, lobs a `#` magic shell at the first enemy ahead. It predicts the landing point from target speed at lock time, then deals `100% ATK` magic damage in a circular `1.75` tile radius AOE with distance falloff and applies `2s` Stasis to ordinary enemies hit | +`280` ATK per effective upgrade |
| u | Defense | Square | 5600 | 180s | 3000 | 500 | 0 | Links cardinal neighbors into shared HP; adjacent u or u sharing a neighbor merge transitively. Pool max HP = sum of member max HP / number of u towers, regardless of level. Hits use the struck tower's defenses. Healing affects the pool; zero HP kills all members. Membership changes preserve HP ratio; merges weight old ratios by old pool max HP. Unlocks after `4-9` | +`2400` own max/current HP per effective upgrade, before division by u count |

Tower, enemy and Boss volleys use at most `5` firing timings across the existing `interval / 5` window. Extra judgments cycle through those timings: `6 = 2/1/1/1/1`, `7 = 2/2/1/1/1`, `11 = 3/2/2/2/2`. A multi-hit projectile is one visible projectile with multiple independent hit resolutions, not a damage multiplier: armor, MR and damage reduction apply separately to every judgment, preserving armor breakpoints. Healing and melee follow the same timing cap. Reflections preserve hit count. Boss mortars aimed at distinct targets keep all targets, with overflow targets fired simultaneously at earlier timings. Attack/heal intervals and upgrade softcaps are unchanged; F's separate shockwave-count effect is unchanged.

Combat grid: `7` lanes x `13` columns.

Current loadout slots: `9`.

Upgrade scaling (actual tower levels, starting at level 1):

- Through level `20`, every level gained grants one effective upgrade.
- Above level `20`, every `2` levels grant one effective upgrade through level `60`.
- Above level `60`, every `4` levels grant one effective upgrade through level `140`.
- Above level `140`, every `8` levels grant one effective upgrade through level `300`.
- Above level `300`, every `16` levels grant one effective upgrade through level `620`; later breakpoints follow `next = current * 2 + 20`, doubling levels per effective upgrade again.
- Effective levels at actual levels `20/21/22/60/61/64/140/300` are `20/20/21/40/40/41/60/80`. Attack, HP and volley upgrades share this rule; raw levels are not rounded down or removed.

## Tools

| Tool | Location | Effect |
| --- | --- | --- |
| Debug | Combat screen top-right when Debug Mode is enabled | Grants `10000` characters and `1000` base integrity, refreshes all card cooldowns, and triggers auto-upgrade checks. |
| True Damage | Combat screen top-right when Debug Mode is enabled | Applies `15000` true damage to the clicked cell. |
| Super True Damage | Combat screen top-right when Debug Mode is enabled | Applies `105000` true damage to the clicked cell. |
| Auto Upgrade | Combat screen top-right, left of Eraser. Hotkey: `2`. | Select `AUTO`, then click a tower to mark/unmark it. Marked towers show a green ring and auto-buy upgrades when their matching card slot is ready. |
| Unlimited Firepower | Level select, left of the difficulty slider | Multiplies wave weight caps by `10` and Boss HP by `10`. Manual placement or upgrade applies to the whole clicked column; cells occupied by other tower types stay unchanged. |
| Eraser | Combat screen top-right. Hotkey: `1`. | Select `ERASE`, then click a placed character to remove it. No character refund. |
| Pause | Spacebar | Freezes combat time while keeping deployment controls available. |

Debug Mode is disabled by default and persists locally from Settings. When disabled, Debug, True Damage, and Super True Damage are hidden in combat and their control rows and shortcuts are inactive.

## Card Slots

- A new save starts with `6` of the current `10` card slots.
- Fully clearing Chapters 1, 2, 3, and 4 unlocks one additional slot each, reaching all `10` slots.
- Stored loadouts are always trimmed to the currently unlocked slot count before combat starts.

## Level 0-1 Tutorial

- Guided introduction to enemy direction, base integrity, production, attacking, blocking, upgrading, lanes, waves, and victory.
- Uses a fixed `X / A / B` loadout and `350` starting characters.
- Three scripted Circle 1 waves only advance after the current lesson is complete.

## Level 0-2 Tutorial

- Introduces the five tower categories and their circle, diamond, square, triangle, and hexagon frames.
- Uses a fixed `F / G` loadout and `500` starting characters.
- Demonstrates F's manual area burst, G's `15s` arming time, and G's automatic contact trigger with two scripted Circle 1 targets.
- Existing saves with progress in a formal chapter automatically count all Chapter 0 tutorials as completed.

## Level 0-3 Tutorial

- Uses a fixed `A` loadout and `150` starting characters.
- Deploys two A towers, marks the upper tower for Auto Upgrade, and waits for a real automatic level purchase; introduces the global Run toggle and character Floor reserve.
- Practices `Shift + click` in Auto Upgrade mode to mark/unmark all currently deployed towers of the same type, using the clicked tower's next state.
- Finishes by selecting Eraser and removing the marked tower with no refund.

## Level 0-4 Tutorial

- Uses a fixed `A / B` loadout and `500` starting characters.
- Demonstrates a single-tower shift, the `15s` base cooldown, placement ghosts, and invalid-destination behavior.
- Demonstrates `Ctrl + left-click` multi-selection, the upper-left anchor, preserved relative positions, and compounded cooldown growth.

## Level 0-5 Tutorial

- A safe, interactive damage lab using the same armor/resistance calculation as combat; no borrowed cards or permanent unlock changes.
- Explains attack power times attack multiplier, physical damage and its 10% armor floor, magic damage and its 5% resistance floor, and true damage.
- Compares individually resolved hits: four 100 physical hits vs. one 400 hit against 300 armor.
- Examples exclude difficulty and special damage reduction; true damage does not bypass invincibility or all-damage reduction.
- Completion rewards now show concise character introductions with direct encyclopedia links and paging for multiple unlocks.

## Level 1-1 Weight Growth

Base rule:

- Wave 1 starts at weight cap `10`.
- Each later wave adds `+4`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 10 | 10 |
| 2 | - | 14 | 14 |
| 3 | - | 18 | 18 |
| 4 | - | 22 | 22 |
| 5 | - | 26 | 26 |
| 6 | - | 30 | 30 |
| 7 | - | 34 | 34 |
| 8 | - | 38 | 38 |
| 9 | - | 42 | 42 |
| 10 | 1 | 46 | 92 |

## Level 1-2 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Triangle 1

Base rule:

- Wave 1 starts at weight cap `13`.
- Each later wave adds `+6`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 13 | 13 |
| 2 | - | 19 | 19 |
| 3 | - | 25 | 25 |
| 4 | - | 31 | 31 |
| 5 | - | 37 | 37 |
| 6 | - | 43 | 43 |
| 7 | - | 49 | 49 |
| 8 | - | 55 | 55 |
| 9 | - | 61 | 61 |
| 10 | 1 | 67 | 134 |

## Level 1-3 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Triangle 1
- Triangle 2

Base rule:

- Wave 1 starts at weight cap `16`.
- Each later wave adds `+8`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 16 | 16 |
| 2 | - | 24 | 24 |
| 3 | - | 32 | 32 |
| 4 | - | 40 | 40 |
| 5 | - | 48 | 48 |
| 6 | - | 56 | 56 |
| 7 | - | 64 | 64 |
| 8 | - | 72 | 72 |
| 9 | - | 80 | 80 |
| 10 | 1 | 88 | 176 |

## Level 1-4 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Square 1

Base rule:

- Wave 1 starts at weight cap `16`.
- Each later wave adds `+8`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 16 | 16 |
| 2 | - | 24 | 24 |
| 3 | - | 32 | 32 |
| 4 | - | 40 | 40 |
| 5 | - | 48 | 48 |
| 6 | - | 56 | 56 |
| 7 | - | 64 | 64 |
| 8 | - | 72 | 72 |
| 9 | - | 80 | 80 |
| 10 | 1 | 88 | 176 |

## Level 1-5 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Triangle 1
- Triangle 2
- Square 1
- Square 2

Boss:

- Cube I

Base rule:

- Wave 1 starts at weight cap `16`.
- Each later wave adds `+8`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- The base weight cap is limited to `600`, then difficulty modifies that capped value.
- There is no wave limit. Cube I death clears the level.

| Wave | Flag | Base Cap | Capped Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 16 | 16 |
| 2 | - | 24 | 24 |
| 3 | - | 32 | 32 |
| 4 | - | 40 | 40 |
| 5 | - | 48 | 48 |
| 6 | - | 56 | 56 |
| 7 | - | 64 | 64 |
| 8 | - | 72 | 72 |
| 9 | - | 80 | 80 |
| 10 | 1 | 88 | 176 |
| 20 | 2 | 168 | 336 |

## Level 1-6 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Circle 3

Base rule:

- Wave 1 starts at weight cap `19`.
- Each later wave adds `+9`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 28 | 28 |
| 3 | - | 37 | 37 |
| 4 | - | 46 | 46 |
| 5 | - | 55 | 55 |
| 6 | - | 64 | 64 |
| 7 | - | 73 | 73 |
| 8 | - | 82 | 82 |
| 9 | - | 91 | 91 |
| 10 | 1 | 100 | 200 |
| 11 | - | 109 | 109 |
| 12 | - | 118 | 118 |
| 13 | - | 127 | 127 |
| 14 | - | 136 | 136 |
| 15 | - | 145 | 145 |
| 16 | - | 154 | 154 |
| 17 | - | 163 | 163 |
| 18 | - | 172 | 172 |
| 19 | - | 181 | 181 |
| 20 | 2 | 190 | 380 |

## Level 1-7 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3

Base rule:

- Wave 1 starts at weight cap `19`.
- Each later wave adds `+9`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 28 | 28 |
| 3 | - | 37 | 37 |
| 4 | - | 46 | 46 |
| 5 | - | 55 | 55 |
| 6 | - | 64 | 64 |
| 7 | - | 73 | 73 |
| 8 | - | 82 | 82 |
| 9 | - | 91 | 91 |
| 10 | 1 | 100 | 200 |
| 11 | - | 109 | 109 |
| 12 | - | 118 | 118 |
| 13 | - | 127 | 127 |
| 14 | - | 136 | 136 |
| 15 | - | 145 | 145 |
| 16 | - | 154 | 154 |
| 17 | - | 163 | 163 |
| 18 | - | 172 | 172 |
| 19 | - | 181 | 181 |
| 20 | 2 | 190 | 380 |

## Level 1-8 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Square 2
- Square 3

Base rule:

- Wave 1 starts at weight cap `19`.
- Each later wave adds `+9`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 28 | 28 |
| 3 | - | 37 | 37 |
| 4 | - | 46 | 46 |
| 5 | - | 55 | 55 |
| 6 | - | 64 | 64 |
| 7 | - | 73 | 73 |
| 8 | - | 82 | 82 |
| 9 | - | 91 | 91 |
| 10 | 1 | 100 | 200 |
| 11 | - | 109 | 109 |
| 12 | - | 118 | 118 |
| 13 | - | 127 | 127 |
| 14 | - | 136 | 136 |
| 15 | - | 145 | 145 |
| 16 | - | 154 | 154 |
| 17 | - | 163 | 163 |
| 18 | - | 172 | 172 |
| 19 | - | 181 | 181 |
| 20 | 2 | 190 | 380 |

## Infinite Front: IF-1

- The entire Infinite Front chapter group unlocks after clearing `1-9`, including Regular Endless and Boss Endless.
- Regular endless mode; Circle is capped at rank IV. Triangle and Square can appear at any positive rank.
- Starting characters and baseline rules follow `1-9`.
- First-wave weight: `19`; first increment: `+10`; increment growth: `+1`.
- Base weight at wave `n`: `19 + 10 * (n - 1) + (n - 1) * (n - 2) / 2`.
- Base weights begin `19, 29, 40, 52, 65`; each 10th wave doubles its weight before difficulty scaling.
- No wave count or weight cap. Only ranks affordable within the current wave budget can spawn, respecting each family's rank cap.
- Records use completed waves, not stage-clear status.
- Exit saves the current battlefield locally. Resume restores it paused, including units, projectiles, skills and pending attacks. Restart or defeat removes the run save but retains the best-wave record.

## Infinite Front: IF-2

- Unlock requirement: clear `2-4` (Infinite Front itself requires `1-9`).
- Enemy families follow `2-4`: Circle, Triangle, Shooting Triangle, Inverted Triangle and Square.
- Circle is capped at IV; the other families have no rank limit.
- Starting characters: `300`, matching `2-4`.
- Weight growth follows `2-4`: initial `19`, increment `+12`, increment growth `+1`; flag waves double weight before difficulty scaling.
- Endless waves, independent best-wave record and battlefield save.

## Infinite Front: IF-3 / IF-4

- IF-3 unlocks after `2-9` and inherits its enemy families, starting characters (`300`) and weight growth (`19`, `+12`, extra `+1`).
- IF-4 unlocks after `3-9` and inherits its enemy families, starting characters and weight growth (`25`, `+16`, extra `+2`).
- Both use unlimited ranks except Circle (capped at IV), with no wave count or weight cap.
- Each has an independent best-wave record and resumable battlefield save. Flag waves double weight before difficulty scaling.

## Infinite Front: IF-5 to IF-12

| Endless stage | Source / clear requirement | Starting characters | Initial weight | Increment | Extra increment |
| --- | --- | --- | --- | --- | --- |
| IF-5 | 4-1 | 500 | 25 | 18 | 3 |
| IF-6 | 4-4 | 500 | 25 | 18 | 3 |
| IF-7 | 4-6 | 500 | 25 | 18 | 3 |
| IF-8 | 4-7 | 500 | 25 | 18 | 3 |
| IF-9 | 5-2 | 5000 | 50 | 50 | 7 |
| IF-10 | 5-4 | 5000 | 50 | 50 | 7 |
| IF-11 | 5-6 | 5000 | 50 | 50 | 7 |
| IF-12 | 5-7 | 5000 | 50 | 50 | 7 |

- Enemy families follow the source stage, with unlimited ordinary ranks except Circle (IV cap).
- Leaders spawn once per family on flag waves, outside the ordinary weight budget. Their rank is the flag number: wave 10 = I, wave 20 = II, wave 30 = III, continuing without a rank cap regardless of the source rank.
- No wave count or weight cap; independent best-wave records and resumable battlefield saves.

## Infinite Front: IF-BE-1

- Boss Endless chapter; unlocks after clearing `1-10`.
- Uses IF dynamic enemy ranks and preview titles (`1/2/3/...`), with Circle capped at IV (`1/2/3/4`); source ranks are not spawn limits.
- Enemy families and initial characters (`300`) follow `1-10`. Weight growth is initial `19`, increment `+10`, extra increment `+1`, with no weight cap; story `1-10` remains unchanged.
- Starts with Cube I. Each defeat immediately spawns the next Cube rank at its original entry position. Existing towers, minions, projectiles, waves and resources remain.
- Cube rank N: HP `150000 + 50000 * (N - 1)`, armor `300 * N`, MR `20`, speed `0.6`. Advance summons rank N Squares. Promotion prioritizes eligible ranks up to N.
- No final victory. Records show highest defeated Boss rank, not completed waves. Restart/defeat retains this record; exiting or reloading saves the active Boss and battlefield for continuation.

## Infinite Front: IF-BE-2

- Boss Endless chapter; unlocks after clearing `2-10`. Initial characters `500`.
- Enemy families follow `2-10`, using the same dynamic ranks and preview format as IF; Circle capped at IV, other families uncapped.
- Weight growth follows `2-10`: initial `19`, increment `+12`, extra increment `+1`, but without a weight cap. All IF and IF-BE operations have uncapped wave weights; story caps remain unchanged.
- Starts with Tetrahedron I. Each defeat immediately spawns the next rank at the fixed entry position; waves and battlefield are not reset.
- All ranks retain `120000` HP, `150` armor, `20` MR, and `1.2` speed (I and II have identical base panels).
- All Inverted/Shooting Triangle summons match Boss rank, including the two-column half-HP burst and five-column critical burst.
- Charge grants `2 + 0.5 * (rank - 1)` speed multiplier for 7s. Existing skill costs, threshold invincibility, critical haste and doubled SP recovery remain unchanged. Each new Boss starts with fresh skill/threshold state.
- Independent highest defeated Boss rank and resumable battlefield save, including pending threshold summons and invincibility deadlines.

## Level 1-9 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Square 2
- Square 3

Base rule:

- Wave 1 starts at weight cap `19`.
- Each later wave adds `+10`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 29 | 29 |
| 3 | - | 39 | 39 |
| 4 | - | 49 | 49 |
| 5 | - | 59 | 59 |
| 6 | - | 69 | 69 |
| 7 | - | 79 | 79 |
| 8 | - | 89 | 89 |
| 9 | - | 99 | 99 |
| 10 | 1 | 109 | 218 |
| 11 | - | 119 | 119 |
| 12 | - | 129 | 129 |
| 13 | - | 139 | 139 |
| 14 | - | 149 | 149 |
| 15 | - | 159 | 159 |
| 16 | - | 169 | 169 |
| 17 | - | 179 | 179 |
| 18 | - | 189 | 189 |
| 19 | - | 199 | 199 |
| 20 | 2 | 209 | 418 |

## Level 1-10 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Square 2
- Square 3

Boss:

- Cube II

Base rule:

- Wave 1 starts at weight cap `19`.
- Each later wave adds `+10`.
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- The base weight cap is limited to `600`, then difficulty modifies that capped value.
- There is no wave limit. Cube II death clears the level.

| Wave | Flag | Base Cap | Capped Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 29 | 29 |
| 3 | - | 39 | 39 |
| 4 | - | 49 | 49 |
| 5 | - | 59 | 59 |
| 6 | - | 69 | 69 |
| 7 | - | 79 | 79 |
| 8 | - | 89 | 89 |
| 9 | - | 99 | 99 |
| 10 | 1 | 109 | 218 |
| 11 | - | 119 | 119 |
| 12 | - | 129 | 129 |
| 13 | - | 139 | 139 |
| 14 | - | 149 | 149 |
| 15 | - | 159 | 159 |
| 16 | - | 169 | 169 |
| 17 | - | 179 | 179 |
| 18 | - | 189 | 189 |
| 19 | - | 199 | 199 |
| 20 | 2 | 209 | 418 |
| 30 | 3 | 309 | 600 |

## Level 2-1 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Shooting Triangle 1

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `10` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |

## Level 2-2 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Shooting Triangle 1
- Shooting Triangle 2

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `10` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |

## Level 2-3 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Shooting Triangle 1
- Shooting Triangle 2
- Inverted Triangle 1

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `10` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |

## Level 2-4 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Shooting Triangle 1
- Shooting Triangle 2
- Inverted Triangle 1
- Inverted Triangle 2
- Square 1

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |
| 11 | - | 184 | 184 |
| 12 | - | 206 | 206 |
| 13 | - | 229 | 229 |
| 14 | - | 253 | 253 |
| 15 | - | 278 | 278 |
| 16 | - | 304 | 304 |
| 17 | - | 331 | 331 |
| 18 | - | 359 | 359 |
| 19 | - | 388 | 388 |
| 20 | 2 | 418 | 836 |

## Level 2-5 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Inverted Triangle 1
- Inverted Triangle 2
- Shooting Triangle 1
- Shooting Triangle 2
- Boss: Tetrahedron 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level is an endless Boss stage.
- Final wave weight cap is capped at `800` before difficulty and unlimited-firepower modifiers.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |
| 11 | - | 184 | 184 |
| 12 | - | 206 | 206 |
| 13 | - | 229 | 229 |
| 14 | - | 253 | 253 |
| 15 | - | 278 | 278 |
| 16 | - | 304 | 304 |
| 17 | - | 331 | 331 |
| 18 | - | 359 | 359 |
| 19 | - | 388 | 388 |
| 20 | 2 | 418 | 800 |

## Level 2-6 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Shooting Triangle 1
- Triangle Ram 1

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |
| 11 | - | 184 | 184 |
| 12 | - | 206 | 206 |
| 13 | - | 229 | 229 |
| 14 | - | 253 | 253 |
| 15 | - | 278 | 278 |
| 16 | - | 304 | 304 |
| 17 | - | 331 | 331 |
| 18 | - | 359 | 359 |
| 19 | - | 388 | 388 |
| 20 | 2 | 418 | 836 |

## Level 2-7 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 3
- Triangle Ram 1
- Triangle Ram 2
- Shooting Triangle 1
- Inverted Triangle 1

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |
| 11 | - | 184 | 184 |
| 12 | - | 206 | 206 |
| 13 | - | 229 | 229 |
| 14 | - | 253 | 253 |
| 15 | - | 278 | 278 |
| 16 | - | 304 | 304 |
| 17 | - | 331 | 331 |
| 18 | - | 359 | 359 |
| 19 | - | 388 | 388 |
| 20 | 2 | 418 | 836 |
| 21 | - | 449 | 449 |
| 22 | - | 481 | 481 |
| 23 | - | 514 | 514 |
| 24 | - | 548 | 548 |
| 25 | - | 583 | 583 |
| 26 | - | 619 | 619 |
| 27 | - | 656 | 656 |
| 28 | - | 694 | 694 |
| 29 | - | 733 | 733 |
| 30 | 3 | 773 | 1546 |

## Level 2-8 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 3
- Triangle Mortar 1
- Triangle Ram 1

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |
| 11 | - | 184 | 184 |
| 12 | - | 206 | 206 |
| 13 | - | 229 | 229 |
| 14 | - | 253 | 253 |
| 15 | - | 278 | 278 |
| 16 | - | 304 | 304 |
| 17 | - | 331 | 331 |
| 18 | - | 359 | 359 |
| 19 | - | 388 | 388 |
| 20 | 2 | 418 | 836 |

## Level 2-9 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Shooting Triangle 1
- Triangle Ram 1
- Triangle Mortar 1
- Triangle Mortar 2
- Triangle Ram 3

Base rule:

- Starting characters: `300`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |
| 11 | - | 184 | 184 |
| 12 | - | 206 | 206 |
| 13 | - | 229 | 229 |
| 14 | - | 253 | 253 |
| 15 | - | 278 | 278 |
| 16 | - | 304 | 304 |
| 17 | - | 331 | 331 |
| 18 | - | 359 | 359 |
| 19 | - | 388 | 388 |
| 20 | 2 | 418 | 836 |
| 21 | - | 449 | 449 |
| 22 | - | 481 | 481 |
| 23 | - | 514 | 514 |
| 24 | - | 548 | 548 |
| 25 | - | 583 | 583 |
| 26 | - | 619 | 619 |
| 27 | - | 656 | 656 |
| 28 | - | 694 | 694 |
| 29 | - | 733 | 733 |
| 30 | 3 | 773 | 1546 |

## Level 2-10 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Shooting Triangle 1
- Triangle Ram 1
- Triangle Mortar 1
- Triangle Mortar 2
- Triangle Ram 3
- Boss: Tetrahedron II

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `19`.
- Wave 2 adds `+12`; each later increment grows by `+1` (`+13`, `+14`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- Final wave cap is capped at `800` before difficulty and unlimited-firepower multipliers.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling and the level cap. The result is floored and never lower than `10`.
- Boss stage: endless waves until Tetrahedron II dies or reaches the base.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 19 | 19 |
| 2 | - | 31 | 31 |
| 3 | - | 44 | 44 |
| 4 | - | 58 | 58 |
| 5 | - | 73 | 73 |
| 6 | - | 89 | 89 |
| 7 | - | 106 | 106 |
| 8 | - | 124 | 124 |
| 9 | - | 143 | 143 |
| 10 | 1 | 163 | 326 |
| 11 | - | 184 | 184 |
| 12 | - | 206 | 206 |
| 13 | - | 229 | 229 |
| 14 | - | 253 | 253 |
| 15 | - | 278 | 278 |
| 16 | - | 304 | 304 |
| 17 | - | 331 | 331 |
| 18 | - | 359 | 359 |
| 19 | - | 388 | 388 |
| 20 | 2 | 418 | 800 |
| 21 | - | 449 | 449 |
| 22 | - | 481 | 481 |
| 23 | - | 514 | 514 |
| 24 | - | 548 | 548 |
| 25 | - | 583 | 583 |
| 26 | - | 619 | 619 |
| 27 | - | 656 | 656 |
| 28 | - | 694 | 694 |
| 29 | - | 733 | 733 |
| 30 | 3 | 773 | 800 |

## Level 3-1 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Square 1
- Diamond 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `10` total waves.
- Diamond 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |

## Level 3-2 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Triangle Ram 1
- Diamond 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Diamond 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |

## Level 3-3 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Triangle 3
- Hexagon 1
- Diamond 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Diamond 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |

## Level 3-4 Weight Growth

Enemy pool:

- Circle 1
- Circle 3
- Triangle Ram 3
- Hexagon 1
- Diamond 1
- Diamond 2

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- Diamonds have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |

## Level 3-5 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Hexagon 1
- Pentagon 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Pentagon 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |

## Level 3-6 Weight Growth

Enemy pool:

- Circle 1
- Square 2
- Triangle Ram 1
- Hexagon 1
- Shooting Pentagon 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Shooting Pentagon 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |

## Level 3-7 Weight Growth

Enemy pool:

- Circle 1
- Charging Hexagon 1
- Hexagon 1
- Pentagon 1
- Shooting Pentagon 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- Pentagon 1 and Shooting Pentagon 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |
| 21 | - | 725 | 725 |
| 22 | - | 781 | 781 |
| 23 | - | 839 | 839 |
| 24 | - | 899 | 899 |
| 25 | - | 961 | 961 |
| 26 | - | 1025 | 1025 |
| 27 | - | 1091 | 1091 |
| 28 | - | 1159 | 1159 |
| 29 | - | 1229 | 1229 |
| 30 | 3 | 1301 | 2602 |

## Level 3-8 Weight Growth

Enemy pool:

- Circle 1
- Triangle 3
- Angel Pentagon 1
- Hexagon 1
- Charging Hexagon 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Angel Pentagon 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |

## Level 3-9 Weight Growth

Enemy pool:

- Circle 1
- Triangle Ram 1
- Triangle 3
- Pentagon 1
- Angel Pentagon 1
- Shooting Pentagon 1
- Diamond 2
- Hexagon 1
- Charging Hexagon 1

Base rule:

- Starting characters: `350`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Pentagon 1, Angel Pentagon 1, Shooting Pentagon 1, and Diamond 2 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 1342 |

## Level 3-10 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Pentagon 1
- Angel Pentagon 1
- Shooting Pentagon 1
- Hexagon 1
- Charging Hexagon 1
- Triangle Ram 3
- Boss: Dodecahedron I

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+16`; each later increment grows by `+2` (`+18`, `+20`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- Final wave weight cap is capped at `800` before difficulty and unlimited-firepower modifiers.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling and the level cap. The result is floored and never lower than `10`.
- Boss stage: endless waves until Dodecahedron I dies or reaches the base.
- Pentagon 1, Angel Pentagon 1, and Shooting Pentagon 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 41 | 41 |
| 3 | - | 59 | 59 |
| 4 | - | 79 | 79 |
| 5 | - | 101 | 101 |
| 6 | - | 125 | 125 |
| 7 | - | 151 | 151 |
| 8 | - | 179 | 179 |
| 9 | - | 209 | 209 |
| 10 | 1 | 241 | 482 |
| 11 | - | 275 | 275 |
| 12 | - | 311 | 311 |
| 13 | - | 349 | 349 |
| 14 | - | 389 | 389 |
| 15 | - | 431 | 431 |
| 16 | - | 475 | 475 |
| 17 | - | 521 | 521 |
| 18 | - | 569 | 569 |
| 19 | - | 619 | 619 |
| 20 | 2 | 671 | 800 |
| 21 | - | 725 | 725 |
| 22 | - | 781 | 781 |
| 23 | - | 839 | 800 |
| 24 | - | 899 | 800 |
| 25 | - | 961 | 800 |
| 26 | - | 1025 | 800 |
| 27 | - | 1091 | 800 |
| 28 | - | 1159 | 800 |
| 29 | - | 1229 | 800 |
| 30 | 3 | 1301 | 800 |

## Level 4-1 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Angel Pentagon 1
- Heart 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `10` total waves.
- Angel Pentagon 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.
- Heart 1 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |

## Level 4-2 Weight Growth

Enemy pool:

- Circle 1
- Triangle Ram 1
- Triangle Ram 2
- Triangle Ram 3
- Hex Mace 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Hex Mace 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 2102 |

## Level 4-6 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Angel Pentagon 1
- Hex Mace 1
- Archangel Heptagon 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Angel Pentagon 1 and Hex Mace 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Archangel Heptagon 1 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 2102 |

## Level 4-3 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 3
- Square 1
- Burrow Arrow 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `10` total waves.
- Burrow Arrow 1 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |

## Level 4-4 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle Ram 1
- Angel Pentagon Ram 1
- Hex Mace 1
- Slope Triangle 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Angel Pentagon Ram 1 and Hex Mace 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Slope Triangle 1 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 2102 |

## Level 4-5 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Angel Pentagon 1
- Slope Triangle 1
- Burrow Arrow 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Angel Pentagon 1 has a minimum Flag 1 gate, so it can first enter the random pool on wave 10.
- Slope Triangle 1 and Burrow Arrow 1 are leader enemies and fixed-spawn once each on flag waves if included in the level pool; they do not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 2102 |

## Level 4-7 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Shooting Triangle 1
- Diamond 1
- Shooting Pentagon 1
- Triangle Ram 3
- Square 1
- Angel Pentagon Ram 1
- Hex Mace 1
- Hex Spell Bulwark 1
- Heart 1
- Archangel Heptagon 1
- Slope Triangle 1
- Burrow Arrow 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- Diamond 1, Shooting Pentagon 1, Angel Pentagon Ram 1, and Hex Mace 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Hex Spell Bulwark 1, Heart 1, Archangel Heptagon 1, Slope Triangle 1, and Burrow Arrow 1 are leader enemies and fixed-spawn once each on flag waves if included in the level pool; they do not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 2102 |
| 21 | - | 1145 | 1145 |
| 22 | - | 1243 | 1243 |
| 23 | - | 1345 | 1345 |
| 24 | - | 1451 | 1451 |
| 25 | - | 1561 | 1561 |
| 26 | - | 1675 | 1675 |
| 27 | - | 1793 | 1793 |
| 28 | - | 1915 | 1915 |
| 29 | - | 2041 | 2041 |
| 30 | 3 | 2171 | 4342 |

## Level 4-8 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Trapezoid 1
- Diamond 1
- Angel Pentagon 1
- Pentagon 1
- Hex Spell Bulwark 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- Diamond 1, Angel Pentagon 1, and Pentagon 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Hex Spell Bulwark 1 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 2102 |
| 21 | - | 1145 | 1145 |
| 22 | - | 1243 | 1243 |
| 23 | - | 1345 | 1345 |
| 24 | - | 1451 | 1451 |
| 25 | - | 1561 | 1561 |
| 26 | - | 1675 | 1675 |
| 27 | - | 1793 | 1793 |
| 28 | - | 1915 | 1915 |
| 29 | - | 2041 | 2041 |
| 30 | 3 | 2171 | 4342 |

## Level 4-9 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Trapezoid 1
- Triangle Mortar 1
- Pentagon 1
- Burrow Arrow 1

Base rule:

- Starting characters: `500`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- Triangle Mortar 1 and Pentagon 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Burrow Arrow 1 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 2102 |
| 21 | - | 1145 | 1145 |
| 22 | - | 1243 | 1243 |
| 23 | - | 1345 | 1345 |
| 24 | - | 1451 | 1451 |
| 25 | - | 1561 | 1561 |
| 26 | - | 1675 | 1675 |
| 27 | - | 1793 | 1793 |
| 28 | - | 1915 | 1915 |
| 29 | - | 2041 | 2041 |
| 30 | 3 | 2171 | 4342 |

## Level 4-10 Weight Growth

Enemy pool:

- Circle 1
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Trapezoid 1
- Triangle Ram 3
- Angel Pentagon Ram 1
- Hex Mace 1
- Shooting Triangle 1
- Diamond 1
- Angel Pentagon 1
- Heart 1
- Burrow Arrow 1
- Slope Triangle 1
- Hex Spell Bulwark 1
- Archangel Heptagon 1

Boss:

- Octahedron I

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `25`.
- Wave 2 adds `+18`; each later increment grows by `+3` (`+21`, `+24`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- This Boss stage caps pre-difficulty wave weight at `1000`.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling and the Boss-stage cap. The result is floored and never lower than `10`.
- Boss stage: endless waves until Octahedron I dies or a base-threatening Octahedron body reaches the base.
- Diamond 1, Angel Pentagon 1, Angel Pentagon Ram 1, and Hex Mace 1 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Heart 1, Burrow Arrow 1, Slope Triangle 1, Hex Spell Bulwark 1, and Archangel Heptagon 1 are leader enemies and fixed-spawn once each on flag waves if included in the level pool; they do not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 25 | 25 |
| 2 | - | 43 | 43 |
| 3 | - | 65 | 65 |
| 4 | - | 91 | 91 |
| 5 | - | 121 | 121 |
| 6 | - | 155 | 155 |
| 7 | - | 193 | 193 |
| 8 | - | 235 | 235 |
| 9 | - | 281 | 281 |
| 10 | 1 | 331 | 662 |
| 11 | - | 385 | 385 |
| 12 | - | 443 | 443 |
| 13 | - | 505 | 505 |
| 14 | - | 571 | 571 |
| 15 | - | 641 | 641 |
| 16 | - | 715 | 715 |
| 17 | - | 793 | 793 |
| 18 | - | 875 | 875 |
| 19 | - | 961 | 961 |
| 20 | 2 | 1051 | 1000 |
| 21 | - | 1145 | 1000 |
| 22 | - | 1243 | 1000 |
| 23 | - | 1345 | 1000 |
| 24 | - | 1451 | 1000 |
| 25 | - | 1561 | 1000 |
| 26 | - | 1675 | 1000 |
| 27 | - | 1793 | 1000 |
| 28 | - | 1915 | 1000 |
| 29 | - | 2041 | 1000 |
| 30 | 3 | 2171 | 1000 |

## Level 5-1 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Square 2
- Square 3
- Trapezoid 1
- Trapezoid 2
- Trapezoid 3
- Heart 2

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Heart 2 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 752 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 2197 | 4394 |

## Level 5-2 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Triangle Ram 1
- Triangle Ram 3
- Inverted Triangle 1
- Inverted Triangle 2
- Inverted Triangle 3
- Shooting Triangle 1
- Shooting Triangle 2
- Shooting Triangle 3
- Triangle Mortar 1
- Triangle Mortar 2
- Triangle Mortar 3
- Burrow Arrow 2

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Triangle Mortars have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Burrow Arrow 2 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 752 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 2197 | 4394 |

## Level 5-3 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Trapezoid 1
- Triangle 3
- Triangle Ram 3
- Angel Pentagon 1
- Angel Pentagon 2
- Archangel Heptagon 2

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- Angel Pentagons have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Archangel Heptagon 2 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 752 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 2197 | 4394 |
| 21 | - | 2380 | 2380 |
| 22 | - | 2570 | 2570 |
| 23 | - | 2767 | 2767 |
| 24 | - | 2971 | 2971 |
| 25 | - | 3182 | 3182 |
| 26 | - | 3400 | 3400 |
| 27 | - | 3625 | 3625 |
| 28 | - | 3857 | 3857 |
| 29 | - | 4096 | 4096 |
| 30 | 3 | 4342 | 8684 |

## Level 5-4 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Hexagon 1
- Hexagon 2
- Trapezoid 1
- Hex Mace 1
- Hex Mace 2
- Hex Spell Bulwark 2

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `20` total waves.
- Hex Maces have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Hex Spell Bulwark 2 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 752 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 2197 | 4394 |

## Level 5-5 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Angel Pentagon Ram 1
- Angel Pentagon Ram 2
- Pentagon 2
- Angel Pentagon 2
- Shooting Pentagon 2
- Hex Mace 2
- Archangel Heptagon 2

Boss:

- Dodecahedron II

Base rule:

- Starting characters: `10000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's cap before the level cap is applied.
- Base wave cap is capped at `3500` before difficulty modifies it.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the capped value. The result is floored and never lower than `10`.
- The level is an endless Boss stage.
- Angel Pentagon Rams, Pentagons, Shooting Pentagons, and Hex Maces have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Archangel Heptagon 2 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Raw Cap | Capped Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 1504 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 4394 | 4394 |
| 21 | - | 2380 | 2380 |
| 22 | - | 2570 | 2570 |
| 23 | - | 2767 | 2767 |
| 24 | - | 2971 | 2971 |
| 25 | - | 3182 | 3182 |
| 26 | - | 3400 | 3400 |
| 27 | - | 3625 | 3500 |
| 28 | - | 3857 | 3500 |
| 29 | - | 4096 | 3500 |
| 30 | 3 | 8684 | 3500 |

## Level 5-6 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Inverted Triangle 1
- Inverted Triangle 2
- Angel Pentagon 2
- Angel Pentagon Ram 2
- Burrow Arrow 2
- Archangel Heptagon 2
- Slope Triangle 2

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- Angel Pentagon 2 and Angel Pentagon Ram 2 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Burrow Arrow 2, Archangel Heptagon 2, and Slope Triangle 2 are leader enemies and fixed-spawn once each on flag waves if included in the level pool; they do not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 752 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 2197 | 4394 |
| 21 | - | 2380 | 2380 |
| 22 | - | 2570 | 2570 |
| 23 | - | 2767 | 2767 |
| 24 | - | 2971 | 2971 |
| 25 | - | 3182 | 3182 |
| 26 | - | 3400 | 3400 |
| 27 | - | 3625 | 3625 |
| 28 | - | 3857 | 3857 |
| 29 | - | 4096 | 4096 |
| 30 | 3 | 4342 | 8684 |

## Level 5-7 Weight Growth

Title: 黑暗前的黄昏

Enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Triangle Ram 1
- Triangle Ram 2
- Triangle Ram 3
- Angel Pentagon Ram 1
- Angel Pentagon Ram 2
- Angel Pentagon Ram 3
- Triangle Mortar 1
- Triangle Mortar 2
- Triangle Mortar 3
- Pentagon 1
- Pentagon 2
- Pentagon 3
- Angel Pentagon 1
- Angel Pentagon 2
- Angel Pentagon 3
- Shooting Pentagon 1
- Shooting Pentagon 2
- Shooting Pentagon 3
- Diamond 1
- Diamond 2
- Diamond 3
- Hexagon 1
- Hexagon 2
- Hexagon 3
- Charging Hexagon 1
- Charging Hexagon 2
- Charging Hexagon 3
- Hex Mace 1
- Hex Mace 2
- Hex Mace 3
- Inverted Triangle 1
- Inverted Triangle 2
- Inverted Triangle 3
- Shooting Triangle 1
- Shooting Triangle 2
- Shooting Triangle 3
- Trapezoid 1
- Trapezoid 2
- Trapezoid 3
- Square 1
- Square 2
- Square 3
- Heart 2
- Burrow Arrow 2
- Slope Triangle 2
- Archangel Heptagon 2
- Hex Spell Bulwark 2

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `30` total waves.
- All Diamonds, Triangle Mortars, Pentagons, Angel Pentagons, Shooting Pentagons, Hex Maces, and Angel Pentagon Rams have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Heart 2, Burrow Arrow 2, Slope Triangle 2, Archangel Heptagon 2, and Hex Spell Bulwark 2 are leader enemies and fixed-spawn once each on flag waves if included in the level pool; they do not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 752 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 2197 | 4394 |
| 21 | - | 2380 | 2380 |
| 22 | - | 2570 | 2570 |
| 23 | - | 2767 | 2767 |
| 24 | - | 2971 | 2971 |
| 25 | - | 3182 | 3182 |
| 26 | - | 3400 | 3400 |
| 27 | - | 3625 | 3625 |
| 28 | - | 3857 | 3857 |
| 29 | - | 4096 | 4096 |
| 30 | 3 | 4342 | 8684 |

## Level 5-8 Weight Growth

Enemy pool:

- Circle 1
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Trapezoid 1
- Triangle Ram 3
- Angel Pentagon Ram 3
- Hex Mace 3
- Shooting Triangle 3
- Diamond 3
- Angel Pentagon 3
- Heart 2
- Burrow Arrow 2
- Slope Triangle 2
- Hex Spell Bulwark 2
- Archangel Heptagon 2

Boss:

- Octahedron II

Base rule:

- Starting characters: `10000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's cap before the level cap is applied.
- Base wave cap is capped at `3500` before difficulty modifies it.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the capped value. The result is floored and never lower than `10`.
- Boss stage: endless waves until Octahedron II dies or a base-threatening Octahedron body reaches the base.
- Diamond 3, Angel Pentagon 3, Angel Pentagon Ram 3, and Hex Mace 3 have a minimum Flag 1 gate, so they can first enter the random pool on wave 10.
- Heart 2, Burrow Arrow 2, Slope Triangle 2, Hex Spell Bulwark 2, and Archangel Heptagon 2 are leader enemies and fixed-spawn once each on flag waves if included in the level pool; they do not consume wave weight.
- Octahedron II's `25%` Boss reinforcement sequence summons rank-2 leaders.

| Wave | Flag | Raw Cap | Capped Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 1504 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 4394 | 3500 |
| 21 | - | 2380 | 2380 |
| 22 | - | 2570 | 2570 |
| 23 | - | 2767 | 2767 |
| 24 | - | 2971 | 2971 |
| 25 | - | 3182 | 3182 |
| 26 | - | 3400 | 3400 |
| 27 | - | 3625 | 3500 |
| 28 | - | 3857 | 3500 |
| 29 | - | 4096 | 3500 |
| 30 | 3 | 8684 | 3500 |

## Level 5-9 Weight Growth

Enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Square 2
- Square 3
- Burrow Arrow 3

Base rule:

- Starting characters: `5000`.
- Wave 1 starts at weight cap `50`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's final cap.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the final cap after flag doubling. The result is floored and never lower than `10`.
- The level has `40` total waves.
- At the start of every 4th wave, when enemies spawn, the next column is permanently sealed from right to left.
- A sealed column gets red `×` marks on every cell; towers already in that column are erased, and no deployment, movement, mirror creation, or generated tower can place onto those cells.
- Burrow Arrow 3 is a leader enemy and fixed-spawns once on flag waves if included in the level pool; it does not consume wave weight.

| Wave | Flag | Base Cap | Final Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 50 | 50 |
| 2 | - | 100 | 100 |
| 3 | - | 157 | 157 |
| 4 | - | 221 | 221 |
| 5 | - | 292 | 292 |
| 6 | - | 370 | 370 |
| 7 | - | 455 | 455 |
| 8 | - | 547 | 547 |
| 9 | - | 646 | 646 |
| 10 | 1 | 752 | 1504 |
| 11 | - | 865 | 865 |
| 12 | - | 985 | 985 |
| 13 | - | 1112 | 1112 |
| 14 | - | 1246 | 1246 |
| 15 | - | 1387 | 1387 |
| 16 | - | 1535 | 1535 |
| 17 | - | 1690 | 1690 |
| 18 | - | 1852 | 1852 |
| 19 | - | 2021 | 2021 |
| 20 | 2 | 2197 | 4394 |
| 21 | - | 2380 | 2380 |
| 22 | - | 2570 | 2570 |
| 23 | - | 2767 | 2767 |
| 24 | - | 2971 | 2971 |
| 25 | - | 3182 | 3182 |
| 26 | - | 3400 | 3400 |
| 27 | - | 3625 | 3625 |
| 28 | - | 3857 | 3857 |
| 29 | - | 4096 | 4096 |
| 30 | 3 | 4342 | 8684 |
| 31 | - | 4595 | 4595 |
| 32 | - | 4855 | 4855 |
| 33 | - | 5122 | 5122 |
| 34 | - | 5396 | 5396 |
| 35 | - | 5677 | 5677 |
| 36 | - | 5965 | 5965 |
| 37 | - | 6260 | 6260 |
| 38 | - | 6562 | 6562 |
| 39 | - | 6871 | 6871 |
| 40 | 4 | 7187 | 14374 |

## Level 5-10 Weight Growth

Phase 1 enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Square 2
- Square 3
- Heart 3

Phase 2 enemy pool:

- Circle 1
- Triangle 1
- Triangle 2
- Triangle 3
- Shooting Triangle 1
- Shooting Triangle 2
- Shooting Triangle 3
- Triangle Ram 1
- Triangle Ram 2
- Triangle Ram 3
- Triangle Mortar 1
- Triangle Mortar 2
- Triangle Mortar 3
- Slope Triangle 3

Phase 3 enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Square 1
- Square 2
- Square 3
- Angel Pentagon Ram 1
- Angel Pentagon Ram 2
- Angel Pentagon Ram 3
- Pentagon 1
- Pentagon 2
- Pentagon 3
- Angel Pentagon 1
- Angel Pentagon 2
- Angel Pentagon 3
- Shooting Pentagon 1
- Shooting Pentagon 2
- Shooting Pentagon 3
- Hex Mace 1
- Hex Mace 2
- Hex Mace 3
- Archangel Heptagon 3

Phase 4 enemy pool:

- Circle 1
- Circle 2
- Circle 3
- Triangle 1
- Triangle 2
- Triangle 3
- Square 1
- Square 2
- Square 3
- Trapezoid 1
- Trapezoid 2
- Trapezoid 3
- Triangle Ram 1
- Triangle Ram 2
- Triangle Ram 3
- Angel Pentagon Ram 1
- Angel Pentagon Ram 2
- Angel Pentagon Ram 3
- Hex Mace 1
- Hex Mace 2
- Hex Mace 3
- Shooting Triangle 1
- Shooting Triangle 2
- Shooting Triangle 3
- Diamond 1
- Diamond 2
- Diamond 3
- Angel Pentagon 1
- Angel Pentagon 2
- Angel Pentagon 3
- Heart 3
- Burrow Arrow 3
- Slope Triangle 3
- Hex Spell Bulwark 3
- Archangel Heptagon 3

Boss:

- Icosahedron I, phased
- Phase 1 HP: `300000`; armor `300`, MR `20`, and `70%` all-damage reduction.
- Phase 1 Ultimate Advance: starts at `30/40` SP, gains `1` SP/s, spends `40` SP to summon Square 3 in every row on the Boss front column and the column immediately behind it.
- Phase 1 Heartbeat Alpha: starts at `30/60` SP, gains `1` SP/s, spends `60` SP to summon Heart 3 on rows 2, 4, and 6 at the rightmost column.
- Phase 1 Heartbeat Beta: starts at `0/60` SP, gains `1` SP/s, spends `60` SP to summon Heart 3 on rows 1, 3, 5, and 7 at the rightmost column.
- Phase 2 HP: `200000`; armor `150`, MR `20`, and `50%` all-damage reduction.
- Phase 2 uses a Tetrahedron II-style skill kit: Charge uses the Tetrahedron II `250%` Haste value; Impact starts at `75/120` SP and summons Inverted Triangle 3 in two columns in front of the Boss; Suppression starts at `75/160` SP and summons Shooting Triangle 3 at the spawn line; Last Stand behaves like Tetrahedron II.
- Phase 2 Leap: starts at `35/50` SP, gains `1` SP/s, spends `50` SP to summon Slope Triangle 3 in every row on the column farthest from the base.
- Phase 2 first `50%` HP burst summons Inverted Triangle 3 in every cell of the five columns farthest from the base and immediately fills Charge SP.
- Phase 2 first `10%` HP burst locks HP at `10%` or `1`, gains `15s` Invincible and `60s` Boss Haste, summons Inverted Triangle 3 in every grid cell, and permanently doubles natural SP gain.
- Phase 3 HP: `300000`; armor `200`, MR `90`, and `70%` baseline all-damage reduction.
- Phase 3 uses the Level 5-5 enemy family expanded to available rank 1 / 2 / 3 variants, but leader enemies in the Icosahedron fight use rank 3.
- Phase 4 HP: `300000`; armor `200`, MR `60`; this is the gold final HP bar.
- Phase 4 uses the Level 5-8 enemy family, with ordinary enemies expanded to rank 1 / 2 / 3 and leaders upgraded to rank 3.
- Phase 4 uses Octahedron-style shared-HP bodies and body-count damage reduction. At `75%`, `50%`, and `25%` HP, it summons another Icosahedron body at the same positional pattern as Octahedron. These threshold summons do not trigger Invincible and do not summon Mirage Sun Bombs.
- Phase 4's `25%` reinforcement sequence summons rank-III leaders.
- The first lethal hit in Phase 4 locks HP to `1`, makes all Icosahedron bodies Invincible for `15s`, and summons one extra Icosahedron at column 2 row 3 moving downward. The next lethal hit after this lock clears the level.

Base rule:

- Starting characters: `50000`.
- Wave 1 starts at weight cap `260`.
- Wave 2 adds `+50`; each later increment grows by `+7` (`+57`, `+64`, ...).
- Every flag wave, currently every `10`th wave, doubles that wave's cap before the level cap is applied.
- Base wave cap is capped at `9000` before difficulty modifies it.
- A wave may leave unused weight, but never exceeds its cap.
- Difficulty modifies the capped value. The result is floored and never lower than `10`.
- When Icosahedron I changes phase, the wave counter and weight accumulation continue, the Boss returns to its starting position, and all current enemies quickly shrink and disappear.
- The next phase starts with its own enemy pool. The first wave of the new phase follows the normal first-wave delay.
- The configured finale currently has four phases. Killing the last configured phase clears the level.
- The first Boss HP bar is Heart pink, the second is orange, the third is light blue, and the fourth/final bar is gold. During each non-final phase, lost HP reveals the next phase color; the final gold bar drains to the normal dark bar back.
- 5-10 ignores enemy minimum-flag gates in every phase.
- Heart 3, Slope Triangle 3, and Archangel Heptagon 3 are leader enemies and fixed-spawn once each on flag waves if included in the active phase pool; they do not consume wave weight.

| Wave | Flag | Raw Cap | Capped Cap |
| ---: | ---: | ---: | ---: |
| 1 | - | 260 | 260 |
| 2 | - | 310 | 310 |
| 3 | - | 367 | 367 |
| 4 | - | 431 | 431 |
| 5 | - | 502 | 502 |
| 6 | - | 580 | 580 |
| 7 | - | 665 | 665 |
| 8 | - | 757 | 757 |
| 9 | - | 856 | 856 |
| 10 | 1 | 1924 | 1924 |
| 11 | - | 1075 | 1075 |
| 12 | - | 1195 | 1195 |
| 13 | - | 1322 | 1322 |
| 14 | - | 1456 | 1456 |
| 15 | - | 1597 | 1597 |
| 16 | - | 1745 | 1745 |
| 17 | - | 1900 | 1900 |
| 18 | - | 2062 | 2062 |
| 19 | - | 2231 | 2231 |
| 20 | 2 | 4814 | 4814 |
| 21 | - | 2590 | 2590 |
| 22 | - | 2780 | 2780 |
| 23 | - | 2977 | 2977 |
| 24 | - | 3181 | 3181 |
| 25 | - | 3392 | 3392 |
| 26 | - | 3610 | 3610 |
| 27 | - | 3835 | 3835 |
| 28 | - | 4067 | 4067 |
| 29 | - | 4306 | 4306 |
| 30 | 3 | 9104 | 9000 |
| 31 | - | 4805 | 4805 |
| 32 | - | 5065 | 5065 |
| 33 | - | 5332 | 5332 |
| 34 | - | 5606 | 5606 |
| 35 | - | 5887 | 5887 |
| 36 | - | 6175 | 6175 |
| 37 | - | 6470 | 6470 |
| 38 | - | 6772 | 6772 |
| 39 | - | 7081 | 7081 |
| 40 | 4 | 14794 | 9000 |

## Spawn Trigger

After the first wave appears, the next wave spawns when either condition is met:

- The latest wave has lost at least half of its spawned weight.
- `30s` has passed since that wave spawned.

The first wave starts `20s` after entering combat.

## Difficulty

Difficulty is selected from `0` to `9` on the level-select screen. Default is `3` (`普通` / `NORMAL`). Old difficulty 0 was removed; old difficulties 1-8 now use indices 0-7. Difficulties 8 and 9 use new values. All ten display names keep their original index assignments.

| Difficulty | Weight Multiplier | Enemy Final Damage Reduction |
| ---: | ---: | ---: |
| 0 | 50% | 0% |
| 1 | 100% | 0% |
| 2 | 140% | 10% |
| 3 | 180% | 30% |
| 4 | 220% | 50% |
| 5 | 260% | 65% |
| 6 | 300% | 75% |
| 7 | 400% | 80% |
| 8 | 520% | 85% |
| 9 | 666% | 90% |

Difficulty 9 is named `哈哈哈哈哈哈哈哈哈` (`HAHAHAHAHAHAHAHAHA`). Legacy endless saves migrate their difficulty index once; old difficulty 0 resumes on the new minimum and old difficulty 9 moves to the rebalanced difficulty 8. Legacy replays at difficulties 1-8 migrate to preserve their parameters; old difficulty 0/9 replays are rejected because those presets were removed or rebalanced.

Enemy final damage reduction is applied after armor, magic resistance, and minimum-damage rules. It also reduces true damage.

## Character Income

- Characters have no fixed cap.
- Chapter 1 starting characters: `200`.
- Chapter 2 starting characters: `300`.
- Chapter 3 starting characters: `350`.
- Chapter 3 Boss stage 3-10 starting characters: `500`.
- Chapter 4 starting characters: `500`.
- Chapter 4 Boss stage 4-10 starting characters: `5000`.
- Chapter 5 starting characters: `5000`.
- Chapter 5 Boss stage 5-5 starting characters: `10000`.
- Chapter 5 finale 5-10 starting characters: `50000`.
- Natural income: `25` every `5s`.

## Infinite Front: IF-BE-3

- Boss Endless based on `5-5`, unlocked by clearing `5-5`; initial characters `10000`.
- Initial weight `50`, increment `+50`, extra increment `+7`, with no weight cap.
- Enemy families follow `5-5`, using the shared IF dynamic ranks and flag-based leader ranks. Circle spawns remain capped at IV.
- Dodecahedron starts at I; each defeat immediately spawns the next rank at the fixed starting position. Records track the highest defeated Boss rank.
- Boss stats stay at HP `100000`, armor `200`, MR `90`, speed `0.6`. Three same-rank companions each have `32000 + 8000 * (rank - 1)` HP, armor `2000`, MR `40`.
- Companion laser/mortar volleys have `4 * rank` / `2 * rank` hits; first companion death fires `7 * rank` laser hits; second targets up to `4` latest towers at every rank, limited by available towers.
- Volleys use at most five firing times with separate stacked hits. Companion count, 95% Boss damage reduction while companions live, 10-second survivor invincibility and Endless Wings stay unchanged.
- Leaving saves companion state and pending attacks; old companions are removed on Boss replacement and old Boss attack actions cannot affect the new round.

## Infinite Front: IF-BE-4

- Boss Endless based on `5-8`; unlocks after clearing `5-8`, with `10000` initial characters.
- Weight starts at `50`, increment `+50`, extra increment `+7`, without a cap. Enemy families follow `5-8` with shared IF dynamic ranks and flag-based leader ranks.
- Octahedron starts at rank I and respawns immediately at the fixed entry after defeat. HP is `120000 + 50000 * (rank - 1)`; armor `200`, MR `60`, speed `0.6` stay unchanged.
- Copies at 75%, 50%, and 25% HP share health and rank, but keep independent statuses and shield states. Body-count reduction remains 20%/40%/60% with 2/3/4 bodies.
- Initial spawn and each split shield every body and summon two Mirage Sun Bombs. Only the 25% split summons reinforcements, all at the Boss's rank: Bulwarks in all rows, Burrow Arrows in rows 2/4/6, Hearts in rows 2/4/6, Slopes in all rows, Archangels in all rows, separated by 0.5s.
- Save/resume preserves copies, movement directions, independent shields, bomb states and pending reinforcements. Replacing the Boss removes old bombs and copies; the new rank begins with a fresh pair of bombs.

## ASCII Expansion: AE-1

- New side-story chapter group `ASCII Expansion`, with an `@` backdrop, unlocked by clearing `4-10`.
- AE-1 is a normal 20-wave operation. Chapter 4 template: initial characters `500`, initial weight `25`, increment `+18`, extra increment `+3`, a flag every 10 waves.
- Pool: Circle I; Triangle I/II/III; Triangle Ram I/II/III; Tilde I/II/III.
- Tildes have Triangle panels and rank growth: HP `5000`, armor `100`, MR `0`, physical attack `600`; weights `30/90/150`, average speeds `15/20/25`, attack intervals `1/0.5/0.33s`.
- Tildes appear at one of six gaps between adjacent lanes. While advancing, they oscillate sinusoidally with a 4-second period and maximum offset of 0.6 cells from that gap. Blocking/freezing pause motion; movement modifiers affect oscillation speed as well as forward speed. Collision uses actual coordinates, including cross-lane projectile sweeps. Their Roman rank label sits above the tilde shape.

## ASCII Expansion: AE-2

- Unlocks after AE-1; 20 waves, 500 starting characters. Chapter 4 weight template: initial 25, increment +18, extra increment +3; one flag every 10 waves.
- Enemy pool: Circle I, Tilde I/II/III, Angel Pentagon I/II, Angel Pentagon Ram I, Archangel Heptagon I, Slope Triangle I, Hexagon I, Hex Spell Bulwark I.
- Clear reward: `@` (ASCII Expansion, function). Costs 1000, cooldown 60s; idle panel 1200 HP, 150 armor, 0 MR, 0 ATK.
- Continuously copies the character in the immediately forward cell if its base cost is at most 999, including ASCII Expansion characters but excluding instant targeted effect cards (`b`, `t`, `y`). Facing changes alter the observed cell. An absent or ineligible target leaves @ without extra abilities.
- Uses the copied base panel, mechanics, category border and upgrade rules at @'s own effective level; the label, card identity, price and facing remain @'s. Does not inherit target level, temporary buffs or current skill charge. Switching preserves HP ratio, restarts attack/arming/skill preparation and cancels pending old-form volleys. Already fired projectiles retain their launch properties.

## ASCII Expansion: AE-3

- Unlocks after AE-2; 20 waves, 500 starting characters. Chapter 4 weights: initial 25, increment +18, extra increment +3; one flag every 10 waves.
- Enemy pool: Circle I, Tilde I/II/III, Equals I/II/III, Shooting Pentagon I, Shooting Triangle I, Diamond I, Heart I.
- Equals: HP 12000, armor 100, MR 25, average speed 15. All ranks have 400 physical attack and attack once per second, identical to Square I. Weights I/II/III: 80/200/320. Appears from the first flag wave.
- On spawning, Equals connects once to up to its rank in nearest eligible enemies. Excludes leaders, Bosses/companions, other Equals and enemies already in a network. Connections never retarget or refill, including after promotion or a storage return. Leaving the field disconnects the member; removing Equals dissolves its network.
- Shared maximum HP is the sum of members' individual maxima, initially using their combined current HP. Damage uses the struck member's defenses before reducing the pool; healing restores the pool. All members show the same health ratio and die together if the pool is depleted. Disconnects and capacity changes preserve the pool's health ratio.
- Visual: white equals sign with Roman rank above it; breathing green connections with solid centers and fading edges.
- Clear rewards: `=`, `1` and `0`. Complete action imitation is replaced by the projectile-circuit prototype.
- `=` is a special edge connector (50 cost, 1s cooldown). Deploy on an internal grid edge between adjacent logical cells. Click cycles `=`, `>`, `<`, closed; vertical links rotate the directions. No ammunition cache or attackable body. Flow replenishes at 25 shots/s per level, with up to one second of credit. Stack the selected = card to upgrade; auto-upgrade marks are supported. Erase via the same edge.
- Empty cells and unrelated towers are transparent paths, without buffers or projectile modification. Route directly to distinct reachable receivers, rotating equally among available receivers rather than splitting at each junction. Multiple paths to one receiver count as one share. Real 0 / + / 1 / - nodes stop transit even when full and cannot be bypassed. Successful delivery atomically spends one flow credit on every link of a viable path; saturated links can be routed around. Closed and directional links still apply.
- Pipelines deliver to at most one subsequent actual node per payload per simulation tick; transparent cells add no delay. Sources must cost <=999. Ordinary projectiles retain their payloads; lasers, homing volleys, mortars, production, healing, summons, activated skills and one-shot effects travel as action payloads. Snapshot source level/stats at input; numeric output uses its own position and facing. Sources still pay SP, cooldowns and self-damage. One-shot sources disappear normally, with no local effect when routed. Blocked, closed or flow-limited inputs execute normally instead. No duplicated actions or persistent passive auras are created.
- Zero buffers 128 projectiles per effective level and automatically forwards them among reachable receivers without duplication. Bidirectional paths allow return to the previous node on a later simulation tick; use directional links to prevent backflow. Losing temporary levels retains excess stock but blocks input while full. Disconnected or blocked shots stay local; destruction loses stock.
- Numeric outlets are input-only: wait for exactly the displayed number of payloads, then execute the whole batch together. Preserve input stats, multi-hit judgments and projectile range. Consumed-tower effects leave the outlet intact because the original source has already disappeared. Higher numbers change grouping, not damage or effective level. Edge modes, upgrades, flow credit, inventories, action snapshots and active routed skills persist in deterministic saves.
- Pipeline connector = costs 50 with 1s cooldown; 0 and 1 cost 50 with 3s cooldown; + and - cost 500 with 10s cooldown. The ordinary nodes retain the 1200 HP / 150 armor / 0 MR / 0 ATK panel. Stack 0 cards to upgrade bank capacity without losing inventory or turning into 1. Zero supports auto-upgrades and extraction batches. Outlet 1 still cannot auto-upgrade.

## ASCII Expansion: AE-4

- Unlocks after AE-3; 20 waves. Chapter 4 template: 500 starting characters, initial weight 25, increment +18, extra increment +3.
- Enemy pool: Circle I, Triangle I/II/III, Equals I/II/III, Triangle Mortar I, Pentagon I.
- Clear rewards: `+`, `-` and `&`.
- `+` is an input-only healing outlet, with the same 128-per-effective-level capacity as - and a fixed consumption rate of 25 payloads/s. Upgrades only increase capacity, retaining existing stock; losing temporary levels does not delete excess stock. Converts remaining total damage to healing at 5:1 for every friendly tower in a centered 5x5 area excluding its four corners, including itself. Honors & topology, has no aura outline and retains stock when all allies in range are healthy. Consumed attacks and their attached effects are not executed. Both + and - reject non-damaging actions such as production or freezing.
- `-` is input-only, with the same 128-per-effective-level local capacity as 0. Automatically uses at most one delivered shot every 0.1s against enemy bullets or mortars within radius 2.6. It never consumes a remote bank's inventory or forwards its own ammunition.
- Cancellation spends 5 friendly raw damage per 1 enemy raw damage. Multi-hit judgments are consumed in order, retaining at most one partial judgment. Leftover ammo stays in the interceptor; surviving enemy shots retain reduced impact damage. Projectile size reflects remaining damage. Lasers and non-projectile skills bypass cancellation.
- `&` changes logical tower-to-tower cells only. Friendly healing/aura outlines use the mapped cells, leaving holes and outlining remote cells. Enemy movement/blocking, offensive targeting and all projectile motion remain physical. Removing an & recomputes the remaining swaps in activation order. Both target cells and ordering persist in battle saves.

## ASCII Expansion: AE-5

- 30 waves, unlocked after AE-4. Chapter-four template: 500 starting characters, first weight 25, increment +18, extra increment +3.
- Clear rewards: `!`, a permanent continuous-fire attachment (200 characters, 30s cooldown), and `()`, a defensive special-placement shell (275 characters, 20s cooldown). The attachment's level affects cooldown refund only; skills and attacks requiring a target are excluded.
- Parenthesis tower: 3000 HP, 300 armor, 40 MR, 0 attack. One shell and one ordinary tower may share a cell in either deployment order. Shell defenses apply to all incoming occupant damage, including true damage and self-damage; the breaking judgment never spills through. Area attacks select the cell once; subsequent multi-hit judgments can hit the exposed occupant. Removing either tower leaves the other. Upgrade adds 80% base HP under normal softcap rules. Bracket-side clicks select the shell for erasure, shifting and auto-upgrade; center clicks select the occupant. @ cannot copy this special placement layer.
- Pool: Circle I; Tilde I/II/III; Equals I/II/III; Triangle Ram I/II/III; Hex Mace I/II; Parentheses I/II/III; Slope Triangle III.
- Parentheses: 5000 HP, 100 armor, 40 MR, speed 15, 600 physical attack every second, unchanged at higher ranks. Weight 80/200/320; capacity rank + 1.
- Each parenthesis shrinks independently with the host's HP ratio using the normal enemy scale curve. Their centers stay the same distance apart; damage never compresses seats or scales passengers.
- Collects eligible enemies on contact and displays them between paired parentheses, oldest at the rear, rank above the group. Gains 35% of passenger total maximum HP and attack; added capacity preserves HP ratio. Uses the fastest member's movement, including movement buffs and ram acceleration.
- Passengers cannot be hit until the host is destroyed. Skills and ranged attacks continue; wing effects lift the entire group. Only the host deals blocked melee damage. Destruction releases passengers at their displayed seats.
- Same group exclusions as Equals: no leaders, Boss companions, solar bombs, Equals, existing health-linked or carried units. Parentheses never loads Parentheses, cannot join Equals links, and cannot be loaded or stored by any mechanism, including Burrow Arrow and q.

## ASCII Expansion: AE-6

- Unlocks after AE-5; 20 waves, 500 starting characters. Chapter 4 weights: initial 25, increment +18, extra increment +3; one flag every 10 waves.
- Enemy pool: Circle I/II, Tilde I/II/III, Equals I/II/III, Parentheses I/II/III, Triangle Mortar I/II/III.

## ASCII Expansion: AE-7

- Clear rewards: `*` (magic shield outlet) and `/` (physical shield outlet), both input-only, 500 characters and 10s cooldown.

- Unlocks after AE-6; 20 waves, 500 starting characters. Chapter 4 weights: initial 25, increment +18, extra increment +3; one flag every 10 waves.
- Enemy pool: Circle I, Tilde I/II/III, Equals I/II/III, Triangle Ram I/II/III, Hex Mace I, Dollar I (`$`), Heart I.

## ASCII Expansion: AE-8

- Clear reward: `[]`, square-bracket protective layer. Costs 275, cooldown 20s, 3000 HP, 600 armor, 0 MR and 0 ATK; other rules match parentheses.

- Unlocks after AE-7; 30 waves, 500 starting characters. Chapter 4 weights: initial 25, increment +18, extra increment +3; one flag every 10 waves.
- Enemy pool: Circle I, Tilde I/II, Parentheses I/II/III, Dollar I (`$`), Square II, Trapezoid II, Triangle Mortar I/II/III, Pentagon I/II/III, Hex Spell Bulwark I.

## ASCII Expansion: AE-9

- Unlocks after AE-8; 20 waves, 500 starting characters. Chapter 4 weights: initial 25, increment +18, extra increment +3; one flag every 10 waves.
- Enemy pool: Circle I, Tilde I/II/III, Equals I/II/III, Parentheses I/II/III, Dollar I (`$`), Greater-Than Sign I (`>`).
- Greater-Than Sign I is a leader, appearing on flag waves without consuming regular wave weight. Unlocking AE-9 also reveals its encyclopedia entry.

## ASCII Expansion: Symbol Domain Capital / AE-EX-1

- Unlocks after AE-10; 10 waves. EX defaults: 2000 starting characters, initial weight 30, increment +35, extra increment +5, a flag every 10 waves, no weight cap.
- Regular enemy pool: Circle I, Tilde I/II/III, Triangle Ram I/II/III. Existing minimum-wave restrictions still apply.
- Environment: every wave additionally spawns exactly one Greater-Than Sign I in row 4, including the flag wave. It consumes no wave weight and does not add another random-lane flag leader. All surviving enemies must be defeated to finish the operation.
- Base weight budgets before difficulty: 30, 65, 105, 150, 200, 255, 315, 380, 450, 1050 (wave 10 doubled).
- Pre-battle previews include the extra enemy and a one-line environment description above ordinary enemies, below the Boss name if present. 5-9 also describes its permanent right-to-left column seal every four waves.

## ASCII Expansion: Symbol Domain Capital / AE-EX-2

- Unlocks after AE-EX-1; 20 waves. Uses EX defaults: 2000 starting characters, initial weight 30, increment +35, extra increment +5, one flag every 10 waves, no weight cap.
- Enemy pool: Circle I, Tilde I/II/III, Equals I, Dollar I, Angel Pentagon Ram I/II/III, Hex Mace I/II/III. Existing flag restrictions still apply.
- Environment: each grid tower enters NUL for 10 seconds every 60 seconds from its own deployment (at ages 60, 120, 180 seconds, etc.). Upgrading, copying forms or moving does not reset the cycle. Newly generated or mirrored towers start their own cycle. Edge connectors remain exempt, as with DEL's Format.
- Reuses NUL suspension, gray glitch rendering, blocked operations/deployment, paused actions and recovery without removal events. Towers recover independently; overlapping NUL layers keep their cell reserved until the last recovers. Individual deadlines and deployment clocks survive snapshots. The effect is listed above the enemy preview.

## ASCII Expansion: AE-10

- Unlocks after AE-9. Boss battle: waves continue until DEL is defeated; not an Infinite Front operation.
- AE-9 enemy pool plus Mortar Triangle I, Pentagon I and Diamond I/II/III. Starting characters 2000; initial weight 25, increment +18, extra increment +3, provisional weight cap 800 (same as 2-10).
- DEL: 500000 HP, 150 armor, 20 MR, speed 0, nominal 3-by-3-cell size with a 2.95-by-2.95-cell hitbox, matching the inset of earlier Bosses. Its single-cell sweep echoes use a 0.95-by-0.95-cell hitbox to avoid touching adjacent lanes. Other base stats follow Tetrahedron I; standard Boss contact damage remains.
- Delete: Stack starts at 40/40 SP, recovers 1 SP/s and spends 40 SP. With no living tower, holds its charge. DEL glitches red for 2s, then selects the most recently placed living tower's physical cell; if none remains, ends without refunding SP. A 5s cell warning follows. At 7s after casting, erases all towers in that cell and prohibits deployment for 90s. Once locked, the cell does not follow a moved/replaced target. Timers pause with battle; existing permanent seals remain permanent.
- Visual: intermittent DEL glitches and two rapidly rotating, tilting rings of alternating binary digits, with rounded zero glyphs. Battle, map preview and encyclopedia share the same renderer.
- At 75% HP (once): immediately becomes invincible and flashes only the DEL text gold. Warns the middle three lanes for 3s, then moves left at speed 600, fully leaves past the base, re-enters from the right and stops at its original position. No base breach during this sequence; invincibility lasts until return. Swept 3x3 hitbox erases and seals touched cells for 40s, without shortening existing longer seals. Each cell is touched once per pass. Timed seal crosses, including Delete: Stack, shrink from 100% to 50% over their duration; permanent seals retain their size.
- Ground warnings are red. Timed and permanent disabled-cell crosses share the 5-9 bold monospace multiplication glyph and dark-red outline; timed crosses scale with remaining duration. All crosses render directly above the board background, below all towers, enemies, Bosses and telegraphs.
- Delete: Format has 75 max SP, starts at 0, costs 75 and recovers 1 SP/s only while DEL is strictly below 50% HP. On cast, DEL alternates with gray NUL for 3s, then all currently present grid towers become NUL for 10s (one gray glitching glyph per cell, including shells). Towers are temporarily absent from combat, targeting, blocking, auras, pipelines, upgrades and user operations; their cells reject all deployment, while other cells remain usable. No removal/death/mirror cascade events occur. State, queued tower actions and stored enemies are preserved and paused. Towers deployed after activation remain functional. Edge connectors (=) are unaffected. Warning, suspension and recovery use battle time and survive snapshots.
- At 25% HP (once, after earlier threshold events): repeats the half-health sweep in lanes 1 and 7, with the same 3s red warning, invincible 1x1 DEL glyphs at speed 600, stationary invincible main Boss, projectile blocking and 40s cell seals. Once both glyphs leave, this invulnerability ends; DEL flashes green and summons one Heart I in each lane (2 total). Older half-health event saves remain compatible.
- At 50% HP (once, after the 75% event if both thresholds were crossed): DEL stays still and invincible. Lanes 2 and 6 warn red for 3s, then each receives an invincible 1x1 DEL glyph moving right-to-left at speed 600. Glyphs use Boss targeting/collision, intercept projectiles, seal swept cells for 40s, and never breach the base. Once both fully leave, this invulnerability ends and DEL flashes green while summoning 3 Triangle Rams V in each lane, one pair every second (6 total). The sequence uses battle time and survives save/restore.

## Recent Enemy Additions

- Greater-Than Sign leader (`>` / `<`): HP `32000`, +`16000` per additional rank, armor `100`, MR `50`, ATK `450` magic, fixed speed `15`. Rank I first appears in AE-9.
- Cannon form charges for `12s`, then fires a light-green ion ball along its facing: `1000% ATK`, radius `2.4` cells, linear damage falloff. No ordinary melee; freezing and High Flight pause charging.
- At half maximum HP it permanently switches to `<`, cancels unfinished charging, sets armor to `260` and base speed to `30`, and uses Hex Mace acceleration/bounce mechanics. Collisions deal **magic** damage equal to ATK times actual speed divided by 10. Facing is unchanged and healing cannot revert the form.

- Heart Lead moves each eligible enemy directly to the caster's row center using actual position for its area test. A tilde's sine-wave center, last position and phase reset there, preventing its former trajectory from offsetting the pull. Simultaneous hearts still claim each target only once.

- Shooting Triangle 2: weight `100`, HP `2000`, armor `70`, attack `400` physical, average speed `4`, body label `II`.
- Shooting Triangle 2 uses Shooting Triangle 1's ranged behavior but fires two red-tinted bolts per attack. The full volley duration is fixed at one fifth of its attack interval, matching tower volleys.
- Trapezoid 2: weight `120`, HP `12000`, armor `100`, MR `90`, attack `400` physical, average speed `10`, body label `II`.
- Trapezoid 3: weight `170`, HP `12000`, armor `100`, MR `100`, attack `400` physical, average speed `10`, body label `III`.
- Diamond 3: weight `300`, HP `2000`, armor `70`, MR `40`, attack `400` magic, average speed `4`, body label `III`; fires 3 magic projectiles per attack.
- Heart 2: no wave weight, HP `9999`, armor `299`, MR `60`, attack `3000` true, fixed speed `30`, body label `II`; otherwise identical to Heart 1.
- Heart 3: no wave weight, HP `9999`, armor `299`, MR `60`, attack `3900` true, fixed speed `30`, body label `III`; otherwise identical to Heart 1.
- Inverted Triangle 3: weight `150`, HP `1000`, armor `70`, MR `60`, attack `3200` magic, average speed `50`, body label `III`.
- Shooting Triangle 3: weight `150`, HP `2000`, armor `70`, attack `400` physical, average speed `4`, body label `III`; fires 3 shots per attack.
- Triangle Mortar 3: weight `270`, HP `1500`, armor `70`, MR `0`, attack `1150` physical, average speed `5.5`, body label `III/III`; fires 3 mortars per attack.
- Burrow Arrow 2: no wave weight, HP `16500`, armor `250`, MR `0`, attack `400` physical, fixed speed `20`, body label `II`; can carry total minion rank `10`.
- Angel Pentagon 2: weight `250`, HP `1200`, armor `50`, MR `20`, attack `300` physical, average speed `20`, body label `II`; Wings starts at `2/15` SP and gains `1.2` SP/s.
- Angel Pentagon 3: weight `300`, HP `1200`, armor `50`, MR `20`, attack `300` physical, average speed `20`, body label `III`; Wings starts at `4/15` SP and gains `1.4` SP/s.
- Archangel Heptagon 2: no wave weight, HP `6000`, armor `50`, MR `20`, attack `1400` magic, fixed speed `30`, body label `II`; Ascension gains `1` SP/s.
- Archangel Heptagon 3: no wave weight, HP `8000`, armor `50`, MR `20`, attack `1400` magic, fixed speed `30`, body label `III`; Ascension gains `1` SP/s.
- Hexagon 2: weight `240`, HP `18000`, armor `150`, MR `20`, attack `400` physical, average speed `5`, body label `II`; Armor aura grants `+80` armor.
- Hexagon 3: weight `320`, HP `18000`, armor `150`, MR `20`, attack `400` physical, average speed `5`, body label `III`; Armor aura grants `+110` armor.
- Charging Hexagon 2: weight `300`, HP `12000`, armor `150`, MR `40`, attack `500` magic, average speed `25`, body label `II`; attacks every `1s`.
- Charging Hexagon 3: weight `450`, HP `12000`, armor `150`, MR `40`, attack `500` magic, average speed `25`, body label `III`; attacks every `0.67s`.
- Hex Mace 2: weight `500`, HP `9000`, armor `150`, MR `0`, attack `460` physical, base average speed `20`, body label `II/II`; on death spawns Charging Hexagon 2 and Hexagon 2.
- Hex Mace 3: weight `625`, HP `9000`, armor `150`, MR `0`, attack `520` physical, base average speed `20`, body label `III/III`; on death spawns Charging Hexagon 3 and Hexagon 3.
- Hex Spell Bulwark 2: no wave weight, HP `24000`, armor `100`, MR `80`, attack `1200` magic, fixed speed `15`, body label `II/II`; same-lane MR aura grants `+50` MR. Hex Spell Bulwark 1's aura grants `+40` MR.
- Hex Spell Bulwark 3: no wave weight, HP `24000`, armor `100`, MR `80`, attack `1200` magic, fixed speed `15`, body label `III/III`; same-lane MR aura grants `+60` MR.
- Angel Pentagon Ram 2: weight `640`, HP `5000`, armor `200`, MR `40`, attack `1400` magic, base average speed `20`, body label `II/II`; on death spawns Angel Pentagon 2 and Pentagon 2.
- Angel Pentagon Ram 3: weight `960`, HP `5000`, armor `200`, MR `40`, attack `1400` magic, base average speed `25`, body label `III/III`; on death spawns Angel Pentagon 3 and Pentagon 3.
- Pentagon 2: weight `240`, HP `1500`, armor `70`, MR `40`, attack `800` magic, average speed `5.5`, body label `II`; fires 2 magic mortars per attack.
- Pentagon 3: weight `360`, HP `1500`, armor `70`, MR `40`, attack `800` magic, average speed `5.5`, body label `III`; fires 3 magic mortars per attack.
- Shooting Pentagon 2: weight `250`, HP `2000`, armor `70`, MR `40`, attack `150` magic, average speed `4`, body label `II`; fires 2 lasers per attack.
- Shooting Pentagon 3: weight `375`, HP `2000`, armor `70`, MR `40`, attack `150` magic, average speed `4`, body label `III`; fires 3 lasers per attack.
- Dodecahedron Companion 2: HP `40000`, armor `2000`, MR `40`, body label `II`; volley shot counts are doubled from Dodecahedron Companion 1.
- Slope Triangle 2: no wave weight, HP `21000`, armor `500`, MR `0`, fixed speed `15`, body label `II`; otherwise identical to Slope Triangle 1. Slope Triangle 1 fixed speed is now `10`.
- Slope Triangle 3: no wave weight, HP `21000`, armor `500`, MR `0`, fixed speed `20`, body label `III`; otherwise identical to Slope Triangle 1.
