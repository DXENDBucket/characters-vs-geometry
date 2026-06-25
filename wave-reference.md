# Wave Reference

## Enemy Weights

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
Stasis gives enemies a blue border and reduces their movement speed to `1/2`. Haste gives enemies light-blue wind trails and raises movement speed to `200%` unless specified otherwise. Power gives enemies a red `!` icon and increases outgoing attack damage by `30%` without changing their base attack stat.
Sunder gives enemies a white `▣` icon and reduces final armor by `35%`; repeated applications refresh its duration.
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
| Heart 1 | 1 per flag wave if included in the level pool; no wave weight | 9999 | 299 | 2100 | True | Body label `I`; MR `60`; fixed speed `30` with no random speed variance. Enemies in the same lane and farther from the base gain a non-stacking `+50%` movement speed bonus. Every `5s`, emits a growing pink heart AOE centered on itself with `1.75` cell radius and outward falloff. Lead starts at `0/5` SP, gains `1` SP/s, then pulls ordinary minions in its column plus four columns behind, within two lanes up/down, into its lane; leaders, Bosses, and Boss companions are not pulled |
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
| Cube II | 200000 | 600 | 20 | 0.6 | `2.95x2.95` cells | Same baseline behavior as Cube I. Advance becomes Advance II and summons Square 2 minions. Also has Promotion II. |
| Tetrahedron I | 120000 | 150 | 20 | 1.2 | `2.95x2.95` cells | Fast-attack Boss with quicker visual rotation. Same baseline behavior as Cube I, but uses tetrahedron-collapse effects. At first `50%` HP or lower, summons Inverted Triangle 1 in every cell of the two columns farthest from the base and immediately fills Charge SP. At first `10%` HP or lower, its HP is held at `10%`, gains `15s` Invincible, gains `60s` Boss Haste at `300%` speed, summons Inverted Triangle 1 in every cell of the five columns farthest from the base, and permanently doubles all skill natural SP gain. If it would die before this triggers, it instead locks at `1` HP and triggers the same effect package. |
| Tetrahedron II | 120000 | 150 | 20 | 1.2 | `2.95x2.95` cells | Same baseline behavior as Tetrahedron I. All Inverted Triangles and Shooting Triangles summoned by its Boss mechanics are rank II. |
| Dodecahedron I | 100000 | 200 | 90 | 0.6 | `2.95x2.95` cells | Whiteboard Boss. Same baseline behavior as Cube I, but has no SP skills. Starts with 3 orbiting Dodecahedron Companions. While any companion is alive, it gains `95%` all-damage reduction; the reduction is removed after all companions die. |
| Dodecahedron II | 100000 | 200 | 90 | 0.6 | `2.95x2.95` cells | Same baseline behavior as Dodecahedron I, but starts with 3 Dodecahedron Companion II enemies. While any companion is alive, it gains `95%` all-damage reduction. When its first companion dies, death-laser volleys increase from `7` to `14`; when its second companion dies, death mortars select up to `6` targets instead of `4`. |
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
- At full SP, consumes `30` SP and promotes the nearest 3 ordinary 2D enemies with body label `I` into their label `II` versions. If fewer than 3 targets exist, it holds at full SP.
- Promotion creates a cube-collapse effect on the target.
- Promotion II, Cube II only: starts at `0/180` SP, gains `1` SP per second, max `180`.
- At full SP, consumes `40` SP and promotes the nearest 3 ordinary 2D enemies with body label `II` into their label `III` versions. If fewer than 3 targets exist, it holds at full SP.
- Advance: starts at `0/120` SP, gains `1` SP per second, max `120`.
- At full SP, consumes `120` SP and summons one Square 1 minion in every lane, one cell in front of its hitbox.
- Advance II, Cube II only: same SP rules as Advance, but summons Square 2 minions.

Dodecahedron mechanics:

- When the first companion dies, Dodecahedron I fires Shooting-Pentagon lasers across its own 3 occupied lanes, `7` volleys total. Dodecahedron II fires `14` volleys instead.
- When the second companion dies, Dodecahedron I uses Pentagon targeting to select up to `4` different towers, then fires one magic Pentagon mortar at each in order. Dodecahedron II selects up to `6` targets instead.
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

| Character | Category | Border | Cost | CD | HP | Armor | MR | Main Effect | Upgrade |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A | Attack | Diamond | 50 | 1s | 1200 | 150 | 0 | Fires 1 bolt, `400◆`, every `2s` | +1 volley per level |
| a | Attack | Diamond | 15 | 1s | 1200 | 150 | 0 | Fires 1 bolt, `400◆`, every `2s`; range is self plus 4 cells ahead | +1 volley per level |
| B | Defense | Square | 75 | 20s | 3000 | 500 | 0 | Blocks; reflects `400◆` when hit by melee attacks | +`2400` max/current HP per level |
| b | Function | Triangle | 75 | 10s | 1200 | 150 | 0 | Instant turn card. Place it on an occupied tower; it occupies that cell briefly, then flips the target tower's facing. Reversed towers mirror their border/letter and show a yellow `<` marker. A reversed tower can be flipped again to return to normal | Each effective level refunds `(level - 1) / level` of b's cooldown after it resolves |
| C | Attack | Diamond | 250 | 3s | 1200 | 150 | 0 | Fires 1 shell, `500◆`, `1.75` tile radius AOE with distance falloff, every `3s` | +1 volley per level |
| c | Function | Triangle | 1425 | 50s | 1200 | 150 | 0 | Speed Clock: gains `1` SP/s, max `20`; at full SP gains a border. Clicking a ready c spends all SP and makes it flash for `10s`; active c towers make other card-slot cooldown speed `(active c level sum + 1)x` only for cards with base cost `999` or lower; c's own card cooldown is not accelerated by this effect. Shift-click a ready c activates all ready c towers | Skill contribution uses its current level |
| D | Defense | Square | 100 | 20s | 3000 | 800 | 0 | High-armor blocker | +`2400` max/current HP per level |
| d | Attack | Diamond | 175 | 10s | 1200 | 150 | 20 | Fires a light-blue piercing magic laser, `400✦`, every `3s`. The laser stops after hitting the first enemy with MR. Hit enemies gain `10s` Sunder, reducing final armor by `35%` and showing a white `▣` icon; repeated hits refresh Sunder to `10s` | +`320✦` attack per level |
| O | Defense | Square | 125 | 20s | 3000 | 500 | 40 | Armor-heavy magic-resistant blocker | +`2400` max/current HP per level |
| R | Defense | Square | 225 | 15s | 3000 | 350 | 35 | Enemy projectiles still damage it, then reflect into friendly projectiles with the same damage and damage type. Locked mortars that hit R are reflected back at the shooter | +`2400` max/current HP per level |
| X | Production | Circle | 50 | 1.5s | 1200 | 150 | 0 | Produces `25` chars every `10s` using attack speed, shown as `Aa`; Zeal speeds this up | +`20` chars per production per level |
| x | Attack | Diamond | 575 | 10s | 1200 | 150 | 0 | Every `1s`, fires four fast accelerating `>` magic homing shots from the four attack-shape corners. Each shot deals `200✦`; x locks the Flying enemy nearest to x when firing, or the enemy or Boss nearest to x if no Flying enemy exists. Shots only retarget after their target dies or disappears, then choose the nearest enemy or Boss to the shot regardless of Flying | +`160✦` projectile damage per level |
| Y | Production | Circle | 125 | 8s | 2000 | 250 | 0 | Does not attack; produces `12` chars every time it is attacked | +80% base production per hit per level |
| E | Attack | Diamond | 150 | 2s | 1200 | 150 | 0 | Fires 3 bolts at `-10/0/+10` degrees, `400◆` each, every `2s` | +1 volley per level |
| e | Healing | Hexagon | 650 | 20s | 1200 | 150 | 20 | Base AS `30` (`2s`): heals every damaged tower in the same centered `5x5` no-corner range as T for `90`. The range is shown with a red border. Towers in range, including e itself, gain non-stacking Zeal: +35% attack speed | +1 healing volley per level |
| M | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts downward at `80/90/100` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| m | Function | Triangle | 1650 | 50s | 1200 | 150 | 60 | Mirror tower. If one side of m has a mirrorable tower and the opposite side is empty and deployable, creates a same-type, same-facing, same-level mirror there. Transient effect towers such as b / t can also mirror onto an already occupied opposite cell and apply their effect to that tower. Only towers with base cost `999` or lower can be mirrored. Mirror links form transitive networks; if one network member disappears, the full network disappears through the same event. If m disappears, the mirror networks adjacent to it are erased | Level N m continuously grants `+(N - 1)` effective levels to the full mirror networks adjacent to it |
| W | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts upward at `-100/-90/-80` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| w | Defense | Square | 175 | 20s | 3000 | 500 | 0 | Blocks and reflects `400◆` when hit by melee attacks like B. Air Patrol: starts at `8/10` SP, gains `1` SP/s only while inactive, flashes its border at full SP, and can be clicked to spend `10` SP for `6s` Flying with a halo. While flying, w does not block grounded enemies but can block regular Flying enemies; High Flight is never blocked | +`2400` max/current HP per level; resets Air Patrol SP |
| F | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy or Boss contact, or when clicked, disappears and emits `10` shockwaves; each deals `1400◆` in a `4x4` area | +`8` shockwaves per level |
| f | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy or Boss contact, or when clicked, disappears, deals no damage, and applies `10s` Stasis to all enemies on the field | +`8s` Stasis duration per level |
| i | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy contact, or when clicked, disappears and freezes all enemies in a `2.6` cell radius for `15s`. Frozen enemies cannot move, attack, or trigger skills; accumulated actual physical damage during Freeze breaks it early once it reaches half max HP. Frozen enemies show a square ice-blue border | +`12s` Freeze duration per level |
| l | Function | Triangle | 175 | 30s | 1200 | 150 | 40 | On enemy or Boss contact, or when clicked, disappears and deals `15000✦` once to a full-column area with `0.75` cells horizontal range. F, f, i, and l borders flash while ready to click | +`12000✦` per level |
| G | Function | Triangle | 15 | 30s | 1200 | 150 | 0 | Arms after `15s`; on enemy or Boss contact, disappears and deals `15000✦` | +`12000✦` per level; resets arming |
| t | Function | Triangle | 925 | 10s | 1200 | 150 | 0 | Instant true-damage amplifier. Place it on an occupied tower; it briefly occupies that cell, then makes all damage dealt by the target tower become true damage. The target shows a gold ring outside the auto-upgrade ring | Each effective level grants `12s` duration and refunds cooldown like b |
| H | Healing | Hexagon | 150 | 20s | 1200 | 150 | 0 | Heals the lowest HP% damaged ally in a centered `3x3` area for `700`, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| h | Defense | Square | 175 | 20s | 3000 | 550 | 0 | Guardian: gains `1` SP/s, max `20`; when full, waits until itself or a tower in its centered `3x3` area is damaged, then spends `20` SP to heal itself and the lowest HP% damaged tower in that area for `40%` of h's max HP | +`2400` max/current HP per level |
| P | Healing | Hexagon | 125 | 20s | 1200 | 150 | 0 | Heals the lowest HP% damaged ally in a 3-lane area covering 3 rear columns, its column, and the next 4 columns for `250`, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| p | Healing | Hexagon | 225 | 20s | 1200 | 150 | 0 | Heals the three lowest HP% damaged allies in a centered `3x3` area for `250` each, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| I | Attack | Diamond | 50 | 2s | 1200 | 150 | 20 | Fires 1 `*` projectile, `400✦`, every `2s`; range is self plus 5 cells ahead | +1 volley per level |
| Q | Attack | Diamond | 175 | 4s | 1200 | 150 | 20 | Fires 1 `$` projectile, `400✦`, every `2s`; range is the full lane ahead. On hit, applies `Stasis` for `1s`, reducing ordinary enemy movement speed to `1/2`; Bosses ignore this debuff | +`320✦` damage per level |
| J | Attack | Diamond | 200 | 4s | 1200 | 150 | 20 | Fires 1 `#` shell, `600✦`, `1.75` tile radius AOE with distance falloff, every `4s`; range is self plus 5 cells ahead | +1 volley per level |
| K | Attack | Diamond | 375 | 4s | 2500 | 300 | 0 | Slashes 1 target for `1800◆`, every `4s`; range is self plus 2 cells ahead | +1 volley per level |
| k | Attack | Diamond | 625 | 10s | 2500 | 300 | 40 | Every `1s`, releases an arc wave that deals `280✦` to all enemies in a `2x3+1` area: its column and next column across 3 lanes, plus one extra forward cell in its lane | +`224✦` attack per level |
| S | Attack | Diamond | 925 | 50s | 1200 | 150 | 40 | Active skill: Spell Mortar. Gains `1` SP/s, max `30`; at full SP gains a border. Click a ready S, or Shift-click to select all ready S, then click any board point to fire 3 arcing `S` shells at `0.5s` intervals. Each shell deals `5000✦` in a `3x3` area. Right-click or clicking UI cancels aiming | +`4000✦` per shell per level; resets SP |
| s | Attack | Diamond | 325 | 30s | 1200 | 150 | 20 | Base attack `0`; AS `3` (`20s`). Every attack, places a same-level `a` in the nearest empty cell in front if one exists. If s is turned, it searches the turned direction and the created a is also turned | Created a level equals s's current effective level |
| Z | Production | Circle | 175 | 4s | 2500 | 300 | 0 | Slashes 1 target for `400◆`, every `2s`; range is self plus 2 cells ahead. Each slash hit produces `Aa15` | +1 volley per level |
| L | Function | Triangle | 200 | 20s | 3000 | 200 | 0 | Every `1s`, shifts all enemies in upper/lower lanes within its column and the front column into its own lane; takes `400◇` per shifted enemy | +`2400` max/current HP per level |
| N | Defense | Square | 125 | 20s | 3000 | 500 | 0 | Every `1s`, pushes all enemies it is blocking `5` cells in its push direction: normal N pushes left, reversed N pushes right. Takes `400◇` per pushed enemy. Enemy projectiles that would hit N are shifted `5` cells in that same direction instead of dealing projectile damage, and N takes `400◇` per shifted projectile. Locked mortar shots targeting N have their landing point shifted by the same distance and also cost N `400◇` once | +`2400` max/current HP per level |
| n | Function | Triangle | 375 | 20s | 3000 | 200 | 0 | Every `1s`, repels all enemies in its own lane within its column and the front column to an adjacent upper/lower lane; odd placement order starts upward, even starts downward, then alternates. Takes `400◇` per shifted enemy | +`2400` max/current HP per level |
| T | Function | Triangle | 650 | 50s | 4000 | 150 | 20 | Every `1s`, takes `700◇`; ordinary units and projectiles in a centered `5x5` no-corner area move at `1/6` speed. Bosses ignore the slow. The area is shown with a deep-purple time border. Whenever it disappears for any reason, clears all projectiles and mortars in that area | +`3200` max/current HP per level |
| U | Function | Triangle | 1275 | 50s | 1200 | 150 | 40 | Grants towers in a centered `3x3` area, excluding itself, bonus levels equal to U's real level. Only affects towers with base cost `999` or lower. Multiple U auras stack additively | Each level raises U's aura bonus by `+1` level |
| V | Attack | Diamond | 775 | 6s | 1200 | 150 | 40 | Every `2s`, lobs a single-target `*` magic shell for `1300` damage along its lane. It prefers the attackable enemy with the lowest max HP, predicts the landing point from target speed at lock time, and can miss | +`1040` magic attack per level |
| v | Attack | Diamond | 500 | 6s | 1200 | 150 | 40 | Every `4s`, lobs a `#` magic shell at the first enemy ahead. It predicts the landing point from target speed at lock time, then deals `500✦` in a circular `1.75` tile radius AOE with distance falloff and applies `2s` Stasis to ordinary enemies hit | +`400✦` damage per level |

Volley upgrades spread consecutive shots or heals across a fixed total volley duration of `interval / 5`, regardless of shot count. The attack/heal interval itself is unchanged and starts after the volley finishes.

Combat grid: `7` lanes x `13` columns.

Current loadout slots: `9`.

Upgrade scaling:

- Up to `+20`, every level grants one effective upgrade.
- Above `+20`, every `2` levels grant one effective upgrade until `+60`.
- Above `+60`, every `4` levels grant one effective upgrade until `+140`.
- Above `+140`, every `8` levels grant one effective upgrade until `+300`.
- Above `+300`, every `16` levels grant one effective upgrade, and the softcap positions keep following `next = current * 2 + 20`.

## Tools

| Tool | Location | Effect |
| --- | --- | --- |
| Debug | Combat screen top-right, left of Auto Upgrade | Grants `10000` characters and `1000` base integrity, refreshes all card cooldowns, and triggers auto-upgrade checks. |
| Auto Upgrade | Combat screen top-right, left of Eraser. Hotkey: `2`. | Select `AUTO`, then click a tower to mark/unmark it. Marked towers show a green ring and auto-buy upgrades when their matching card slot is ready. |
| Unlimited Firepower | Level select, left of the difficulty slider | Multiplies wave weight caps by `10` and Boss HP by `10`. Manual placement or upgrade applies to the whole clicked column; cells occupied by other tower types stay unchanged. |
| Eraser | Combat screen top-right. Hotkey: `1`. | Select `ERASE`, then click a placed character to remove it. No character refund. |
| Pause | Spacebar | Freezes combat time while keeping deployment controls available. |

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

Difficulty is selected from `0` to `8` on the level-select screen. Default is `3`.

| Difficulty | Weight Multiplier | Enemy Final Damage Reduction |
| ---: | ---: | ---: |
| 0 | 10% | 0% |
| 1 | 50% | 0% |
| 2 | 100% | 0% |
| 3 | 140% | 10% |
| 4 | 180% | 30% |
| 5 | 220% | 50% |
| 6 | 260% | 65% |
| 7 | 300% | 75% |
| 8 | 400% | 80% |

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

## Recent Enemy Additions

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
