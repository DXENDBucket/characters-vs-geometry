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
| Inverted Triangle 1 | 50 | 1000 | 70 | 2000 | ✦ | Body label `I`; MR `60`; average speed `40`; after being blocked by the same tower for `2s`, disappears and detonates against that tower |
| Shooting Triangle 1 | 50 | 2000 | 70 | 400 | ◆ | Body label `I`; average speed `4`; points toward the base and fires red-tinted bolts every `2s` |
| Square 1 | 50 | 12000 | 300 | 400 | ◆ | Body label `I`; average speed `6` |
| Square 2 | 150 | 12000 | 600 | 400 | ◆ | Body label `II`; average speed `6` |
| Square 3 | 250 | 12000 | 900 | 400 | ◆ | Body label `III`; average speed `6` |

Damage symbols: `◆` physical, `✦` magic, `◇` true. Magic-damage projectiles and related hit effects use light blue.
Effect symbols: `Aa` character production, `♡` healing.
Triangle enemies all deal Triangle 1's `600◆`; Triangle N attacks every `1/N` seconds.
Shooting Triangle is a separate ranged enemy and does not use Triangle N attack scaling.
Numbered minion weights use fixed additive steps: circles `+40`, triangles `+60`, squares `+100`.
Enemy body labels are displayed as Roman numerals in-game.

## Bosses

| Boss | HP | Armor | MR | Speed | Hitbox | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Cube I | 150000 | 300 | 20 | 0.6 | `2.95x2.95` cells | Appears at combat start. Does not shrink from damage. Killing it clears the level; reaching the base fails the level. Deals `2000◆` every `0.5s` to all touching towers at once, with a following cube-collapse effect on each target. |
| Cube II | 200000 | 600 | 20 | 0.6 | `2.95x2.95` cells | Same baseline behavior as Cube I. Advance becomes Advance II and summons Square 2 minions. Also has Promotion II. |

Cube skills:

- Each skill has independent SP.
- All skills can only activate at full SP.
- Promotion: starts at `0/90` SP, gains `1` SP per second, max `90`.
- At full SP, consumes `30` SP and promotes the nearest ordinary 2D enemy with body label `I` into its label `II` version. If no target exists, it holds at full SP.
- Promotion creates a cube-collapse effect on the target.
- Promotion II, Cube II only: starts at `0/180` SP, gains `1` SP per second, max `180`.
- At full SP, consumes `40` SP and promotes the nearest ordinary 2D enemy with body label `II` into its label `III` version. If no target exists, it holds at full SP.
- Advance: starts at `0/120` SP, gains `1` SP per second, max `120`.
- At full SP, consumes `120` SP and summons one Square 1 minion in every lane, one cell in front of its hitbox.
- Advance II, Cube II only: same SP rules as Advance, but summons Square 2 minions.

## Character Attributes

| Character | Category | Border | Cost | CD | HP | Armor | MR | Main Effect | Upgrade |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A | Attack | Diamond | 50 | 1s | 1200 | 150 | 0 | Fires 1 bolt, `400◆`, every `2s` | +1 volley per level |
| B | Defense | Square | 100 | 20s | 3000 | 500 | 0 | Blocks; reflects `400◆` when hit by melee attacks | +`2400` max/current HP per level |
| C | Attack | Diamond | 350 | 3s | 1200 | 150 | 0 | Fires 1 shell, `500◆`, `1` tile AOE, every `3s` | +1 volley per level |
| D | Defense | Square | 100 | 20s | 3000 | 800 | 0 | High-armor blocker | +`2400` max/current HP per level |
| X | Production | Circle | 50 | 1.5s | 1200 | 150 | 0 | Produces `25` chars every `10s`, shown as `Aa` | +`20` chars per production per level |
| E | Attack | Diamond | 150 | 2s | 1200 | 150 | 0 | Fires 3 bolts at `-10/0/+10` degrees, `400◆` each, every `2s` | +1 volley per level |
| M | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts downward at `80/90/100` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| W | Attack | Diamond | 75 | 2s | 1200 | 150 | 0 | Fires 3 bolts upward at `-100/-90/-80` degrees, `400◆` each, every `2s`; all shots start from the cell center | +1 volley per level |
| F | Function | Triangle | 125 | 30s | 1200 | 150 | 0 | On enemy or Boss contact, disappears and emits `10` shockwaves; each deals `1200◆` in a `3x3` area | +`8` shockwaves per level |
| G | Function | Triangle | 25 | 30s | 1200 | 150 | 0 | Arms after `15s`; on enemy or Boss contact, disappears and deals `15000✦` | +`12000✦` per level; resets arming |
| H | Healing | Hexagon | 150 | 20s | 1200 | 150 | 0 | Heals the lowest HP% damaged ally in a `2x3` area covering its column and the front column for `1000`, every `2s`, shown as `♡`; ties prefer earlier placement | +1 healing volley per level |
| I | Attack | Diamond | 100 | 2s | 1200 | 150 | 20 | Fires 1 `*` projectile, `300✦`, every `2s`; range is self plus 5 cells ahead | +1 volley per level |
| J | Attack | Diamond | 375 | 4s | 1200 | 150 | 20 | Fires 1 `#` shell, `600✦`, `1` tile AOE, every `4s`; range is self plus 5 cells ahead | +1 volley per level |
| K | Attack | Diamond | 375 | 4s | 2500 | 300 | 0 | Slashes 1 target for `1600◆`, every `4s`; range is self plus 2 cells ahead | +1 volley per level |
| L | Function | Triangle | 200 | 20s | 3000 | 200 | 0 | Every `1s`, shifts all enemies in upper/lower lanes within its column and the front column into its own lane; takes `400◇` per shifted enemy | +`2400` max/current HP per level |
| N | Defense | Square | 125 | 20s | 3000 | 500 | 0 | Every `1s`, pushes all enemies it is blocking `4` cells left; takes `400◇` per pushed enemy | +`2400` max/current HP per level |

Volley upgrades spread consecutive shots or heals across a total volley duration of `interval * (1 - 0.8^(shots - 1))`, so the full volley duration approaches the unit's attack/heal interval as shot count grows. The attack/heal interval itself is unchanged and starts after the volley finishes.

Combat grid: `7` lanes x `13` columns.

Current loadout slots: `8`.

Upgrade scaling:

- Up to `+10`, every level grants one effective upgrade.
- Above `+10`, every `2` levels grant one effective upgrade until `+30`.
- Above `+30`, every `4` levels grant one effective upgrade until `+70`.
- Above `+70`, every `8` levels grant one effective upgrade until `+150`.
- Above `+150`, every `16` levels grant one effective upgrade, and the softcap positions keep following `next = current * 2 + 10`.

## Tools

| Tool | Location | Effect |
| --- | --- | --- |
| Debug | Combat screen top-right, left of Auto Upgrade | Grants `10000` characters immediately and triggers auto-upgrade checks. |
| Auto Upgrade | Combat screen top-right, left of Eraser | Select `AUTO`, then click a tower to mark/unmark it. Marked towers show a green ring and auto-buy upgrades when their matching card slot is ready. |
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
- The base weight cap is limited to `300`, then difficulty modifies that capped value.
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
| 20 | 2 | 168 | 300 |

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
- The base weight cap is limited to `300`, then difficulty modifies that capped value.
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
| 20 | 2 | 209 | 300 |
| 30 | 3 | 309 | 300 |

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
- Shooting Triangle 2 uses Shooting Triangle 1's ranged behavior but fires two red-tinted bolts per attack. The volley interval uses the same curve as upgraded tower volleys.
