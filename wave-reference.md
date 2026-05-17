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
| Inverted Triangle 1 | 50 | 1000 | 70 | 2000 | ✦ | Body label `I`; MR `60`; average speed `40`; after being blocked by the same tower for `2s`, disappears and detonates against that tower |
| Inverted Triangle 2 | 100 | 1000 | 70 | 2600 | ✦ | Body label `II`; MR `60`; average speed `45`; after being blocked by the same tower for `2s`, disappears and detonates against that tower |
| Shooting Triangle 1 | 50 | 2000 | 70 | 400 | ◆ | Body label `I`; average speed `4`; points toward the base and fires red-tinted bolts every `2s` |
| Triangle Mortar 1 | 90 | 1500 | 70 | 1150 | ◆ | Body label `I/I`; MR `0`; average speed `3`; every `15s`, fires a shell-like physical mortar with `3x3` AOE at the tower blocking the most enemies. Ties target the later-placed tower. N rewrites the landing point if targeted; R takes damage and reflects a matching mortar back at the shooter |
| Triangle Mortar 2 | 180 | 1500 | 70 | 1150 | ◆ | Body label `II/II`; MR `0`; average speed `3`; every `15s`, fires 2 shell-like physical mortars with `3x3` AOE. The volley window is fixed at one fifth of its attack interval, so the two shots are `3s` apart |
| Diamond 1 | 100 | 2000 | 70 | 400 | ✦ | Body label `I`; MR `40`; average speed `4`; fires red `*` magic projectiles every `2s`; does not naturally appear before Flag 1 |
| Hexagon 1 | 160 | 18000 | 150 | 400 | ◆ | Body label `I`; MR `20`; average speed `5`; melee attack every `1s`; flat side faces the base. Enemies within `1.4` cells, including itself, gain Armor: `+200` armor per Hexagon aura, stacking additively and shown as `⬡`. When hit, gains `+1` SP up to `10`; at full SP, heals the lowest HP% damaged enemy within `1.4` cells for `30%` of Hexagon max HP |
| Square 1 | 50 | 12000 | 300 | 400 | ◆ | Body label `I`; average speed `6` |
| Square 2 | 150 | 12000 | 600 | 400 | ◆ | Body label `II`; average speed `6` |
| Square 3 | 250 | 12000 | 900 | 400 | ◆ | Body label `III`; average speed `6` |

Damage symbols: `◆` physical, `✦` magic, `◇` true. Magic-damage projectiles and related hit effects use light blue.
Effect symbols: `Aa` character production, `♡` healing.
Stasis gives enemies a blue border and reduces their movement speed to `1/3`. Haste gives enemies light-blue wind trails and raises movement speed to `200%` unless specified otherwise. Power gives enemies a red `!` icon and increases outgoing attack damage by `30%` without changing their base attack stat.
Armor from Hexagons gives enemies a `⬡` icon and stacks additively as bonus armor.
Triangle enemies all deal Triangle 1's `600◆`; Triangle N attacks every `1/N` seconds.
Shooting Triangle is a separate ranged enemy and does not use Triangle N attack scaling.
Locked attacks, including Triangle Mortars, target the tower blocking the attacker if the attacker is currently blocked; otherwise they use their normal targeting rule.
Enemies with a minimum flag gate are excluded from random wave pools before that flag wave. All Diamonds and Triangle Mortars require Flag 1, so they can start appearing on wave 10 of standard 10-wave flags.
Numbered minion weights use fixed additive steps: circles `+40`, triangles `+60`, squares `+100`.
Enemy body labels are displayed as Roman numerals in-game.

## Bosses

| Boss | HP | Armor | MR | Speed | Hitbox | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Cube I | 150000 | 300 | 20 | 0.6 | `2.95x2.95` cells | Appears at combat start. Does not shrink from damage. Killing it clears the level; reaching the base fails the level. Deals `2000◆` every `0.5s` to all touching towers at once, with a following cube-collapse effect on each target. |
| Cube II | 200000 | 600 | 20 | 0.6 | `2.95x2.95` cells | Same baseline behavior as Cube I. Advance becomes Advance II and summons Square 2 minions. Also has Promotion II. |
| Tetrahedron I | 120000 | 150 | 20 | 1.2 | `2.95x2.95` cells | Fast-attack Boss with quicker visual rotation. Same baseline behavior as Cube I, but uses tetrahedron-collapse effects. At first `50%` HP or lower, summons Inverted Triangle 1 in every cell of the two columns farthest from the base and immediately fills Charge SP. At first `10%` HP or lower, its HP is held at `10%`, gains `15s` Invincible, gains `60s` Boss Haste at `300%` speed, summons Inverted Triangle 1 in every cell of the five columns farthest from the base, and permanently doubles all skill natural SP gain. If it would die before this triggers, it instead locks at `1` HP and triggers the same effect package. |
| Tetrahedron II | 120000 | 150 | 20 | 1.2 | `2.95x2.95` cells | Same baseline behavior as Tetrahedron I. All Inverted Triangles and Shooting Triangles summoned by its Boss mechanics are rank II. |

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
| C | Attack | Diamond | 250 | 3s | 1200 | 150 | 0 | Fires 1 shell, `500◆`, `1.75` tile radius AOE, every `3s` | +1 volley per level |
| c | Function | Triangle | 1425 | 70s | 1200 | 150 | 0 | Speed Clock: gains `1` SP/s, max `20`; at full SP gains a border. Clicking a ready c spends all SP and makes it flash for `10s`; active c towers make other card-slot cooldown speed `(active c level sum + 1)x`; c's own card cooldown is not accelerated by this effect. Shift-click a ready c activates all ready c towers | Skill contribution uses its current level |
| D | Defense | Square | 100 | 20s | 2600 | 800 | 0 | High-armor blocker | +`2080` max/current HP per level |
| O | Defense | Square | 125 | 20s | 3000 | 550 | 40 | Armor-heavy magic-resistant blocker | +`2400` max/current HP per level |
| R | Defense | Square | 225 | 15s | 3000 | 350 | 35 | Enemy projectiles still damage it, then reflect into friendly projectiles with the same damage and damage type. Locked mortars that hit R are reflected back at the shooter | +`2400` max/current HP per level |
| X | Production | Circle | 50 | 1.5s | 1200 | 150 | 0 | Produces `25` chars every `10s`, shown as `Aa` | +`20` chars per production per level |
| Y | Production | Circle | 75 | 8s | 2000 | 250 | 0 | Does not attack; produces `12` chars every time it is attacked | +80% base production per hit per level |
| E | Attack | Diamond | 150 | 2s | 1200 | 150 | 0 | Fires 3 bolts at `-10/0/+10` degrees, `400◆` each, every `2s` | +1 volley per level |
| M | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts downward at `80/90/100` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| W | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts upward at `-100/-90/-80` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| F | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy or Boss contact, disappears and emits `10` shockwaves; each deals `1400◆` in a `4x4` area | +`8` shockwaves per level |
| f | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy or Boss contact, disappears, deals no damage, and applies `10s` Stasis to all enemies on the field | +`8s` Stasis duration per level |
| G | Function | Triangle | 25 | 30s | 1200 | 150 | 0 | Arms after `15s`; on enemy or Boss contact, disappears and deals `15000✦` | +`12000✦` per level; resets arming |
| H | Healing | Hexagon | 150 | 20s | 1200 | 150 | 0 | Heals the lowest HP% damaged ally in a `2x3` area covering its column and the front column for `700`, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| h | Defense | Square | 175 | 20s | 3000 | 550 | 0 | Guardian: gains `1` SP/s, max `20`; when full, waits until itself or a tower in its centered `3x3` area is damaged, then spends `20` SP to heal itself and the lowest HP% damaged tower in that area for `40%` of h's max HP | +`2400` max/current HP per level |
| P | Healing | Hexagon | 125 | 20s | 1200 | 150 | 0 | Heals the lowest HP% damaged ally in a `5x3` area covering its column and the next 4 columns for `250`, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| I | Attack | Diamond | 50 | 2s | 1200 | 150 | 20 | Fires 1 `*` projectile, `400✦`, every `2s`; range is self plus 5 cells ahead | +1 volley per level |
| Q | Attack | Diamond | 225 | 4s | 1200 | 150 | 20 | Fires 1 `$` projectile, `300✦`, every `2s`; range is the full lane ahead. On hit, applies `Stasis` for `1s`, reducing ordinary enemy movement speed to `1/3`; Bosses ignore this debuff | +1 volley per level |
| J | Attack | Diamond | 200 | 4s | 1200 | 150 | 20 | Fires 1 `#` shell, `600✦`, `1.75` tile radius AOE, every `4s`; range is self plus 5 cells ahead | +1 volley per level |
| K | Attack | Diamond | 375 | 4s | 2500 | 300 | 0 | Slashes 1 target for `1600◆`, every `4s`; range is self plus 2 cells ahead | +1 volley per level |
| S | Attack | Diamond | 925 | 50s | 1200 | 150 | 40 | Active skill: Spell Mortar. Gains `1` SP/s, max `30`; at full SP gains a border. Click a ready S, or Shift-click to select all ready S, then click any board point to fire 3 arcing `S` shells at `0.5s` intervals. Each shell deals `5000✦` in a `3x3` area. Right-click or clicking UI cancels aiming | +`4000✦` per shell per level; resets SP |
| Z | Production | Circle | 175 | 4s | 2500 | 300 | 0 | Slashes 1 target for `400◆`, every `2s`; range is self plus 2 cells ahead. Each slash hit produces `Aa15` | +1 volley per level |
| L | Function | Triangle | 200 | 20s | 3000 | 200 | 0 | Every `1s`, shifts all enemies in upper/lower lanes within its column and the front column into its own lane; takes `400◇` per shifted enemy | +`2400` max/current HP per level |
| N | Defense | Square | 125 | 20s | 3000 | 500 | 0 | Every `1s`, pushes all enemies it is blocking `4` cells left; takes `400◇` per pushed enemy. Enemy projectiles that would hit N are shifted left by `4` cells instead and do not damage N; locked mortar shots targeting N have their landing point shifted left by the same distance | +`2400` max/current HP per level |
| T | Function | Triangle | 650 | 50s | 4000 | 150 | 20 | Every `1s`, takes `700◇`; ordinary units and projectiles in a centered `5x5` no-corner area move at `1/6` speed. Bosses ignore the slow. The area is shown with a deep-purple time border. On death, clears projectiles in that area; eraser removal does not trigger this | +`3200` max/current HP per level |

Volley upgrades spread consecutive shots or heals across a fixed total volley duration of `interval / 5`, regardless of shot count. The attack/heal interval itself is unchanged and starts after the volley finishes.

Combat grid: `7` lanes x `13` columns.

Current loadout slots: `9`.

Upgrade scaling:

- Up to `+10`, every level grants one effective upgrade.
- Above `+10`, every `2` levels grant one effective upgrade until `+30`.
- Above `+30`, every `4` levels grant one effective upgrade until `+70`.
- Above `+70`, every `8` levels grant one effective upgrade until `+150`.
- Above `+150`, every `16` levels grant one effective upgrade, and the softcap positions keep following `next = current * 2 + 10`.

## Tools

| Tool | Location | Effect |
| --- | --- | --- |
| Debug | Combat screen top-right, left of Auto Upgrade | Grants `10000` characters and `1000` base integrity, refreshes all card cooldowns, and triggers auto-upgrade checks. |
| Auto Upgrade | Combat screen top-right, left of Eraser | Select `AUTO`, then click a tower to mark/unmark it. Marked towers show a green ring and auto-buy upgrades when their matching card slot is ready. |
| Unlimited Firepower | Level select, left of the difficulty slider | Multiplies wave weight caps by `10` and Boss HP by `10`. Manual placement or upgrade applies to the whole clicked column; cells occupied by other tower types stay unchanged. |
| Eraser | Combat screen top-right | Select `ERASE`, then click a placed character to remove it. No character refund. |
| Pause | Spacebar | Freezes combat time while keeping deployment controls available. |

## Level 0-1 Weight Growth

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

## Level 0-2 Weight Growth

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

## Level 0-3 Weight Growth

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

## Level 0-4 Weight Growth

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

## Level 0-5 Weight Growth

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

## Level 0-6 Weight Growth

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

## Level 0-7 Weight Growth

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

## Level 0-8 Weight Growth

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

## Level 0-9 Weight Growth

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

## Level 0-10 Weight Growth

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

## Level 1-1 Weight Growth

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

## Level 1-2 Weight Growth

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

## Level 1-3 Weight Growth

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

## Level 1-4 Weight Growth

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

## Level 1-5 Weight Growth

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

## Level 1-6 Weight Growth

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

## Level 1-7 Weight Growth

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

## Level 1-8 Weight Growth

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

## Level 1-9 Weight Growth

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

## Level 1-10 Weight Growth

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

## Level 2-1 Weight Growth

Enemy pool:

- Circle 1
- Triangle 1
- Square 1
- Diamond 1

Base rule:

- Starting characters: `300`.
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

## Level 2-2 Weight Growth

Enemy pool:

- Circle 1
- Square 1
- Triangle Ram 1
- Diamond 1

Base rule:

- Starting characters: `300`.
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

## Spawn Trigger

After the first wave appears, the next wave spawns when either condition is met:

- The latest wave has lost at least half of its spawned weight.
- `20s` has passed since that wave spawned.

The first wave starts `20s` after entering combat.

## Difficulty

Difficulty is selected from `0` to `8` on the level-select screen. Default is `3`.

| Difficulty | Weight Multiplier | Enemy Final Damage Reduction |
| ---: | ---: | ---: |
| 0 | 10% | 0% |
| 1 | 40% | 0% |
| 2 | 70% | 0% |
| 3 | 100% | 0% |
| 4 | 140% | 0% |
| 5 | 180% | 30% |
| 6 | 220% | 60% |
| 7 | 300% | 75% |
| 8 | 500% | 85% |

Enemy final damage reduction is applied after armor, magic resistance, and minimum-damage rules. It also reduces true damage.

## Character Income

- Characters have no fixed cap.
- Chapter 0 starting characters: `200`.
- Chapter 1 starting characters: `300`.
- Natural income: `25` every `5s`.

## Recent Enemy Additions

- Shooting Triangle 2: weight `100`, HP `2000`, armor `70`, attack `400` physical, average speed `4`, body label `II`.
- Shooting Triangle 2 uses Shooting Triangle 1's ranged behavior but fires two red-tinted bolts per attack. The full volley duration is fixed at one fifth of its attack interval, matching tower volleys.
