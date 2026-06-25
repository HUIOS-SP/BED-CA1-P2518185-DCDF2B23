# Leviathan Mechanics Guide

This guide documents the implemented gameplay rules. The active game is endless; seeded campaign rows are retained only as read-only flavour catalogue content.

## Player and Army Lifecycle

`POST /users` creates, in one transaction:

1. one user;
2. one army;
3. one resource row;
4. one direct equipment row;
5. one army-unit row for each unit type;
6. one endless campaign-progress row;
7. one `campaign_started` log.

The unique `armies.user_id` constraint enforces one army per user. Armies cannot be independently created or deleted through the API. Deleting the user cascades through all army-owned rows.

Gameplay routes use `userId` to select the player. Authentication is outside the CA1 scope.

## Starting State

### Resources

| Resource | Starting value |
| --- | ---: |
| manpower | 120 |
| ducats | 180 |
| flour | 120 |
| supply | 100 |
| morale | 50 |

### Equipment

| Equipment | Starting value |
| --- | ---: |
| muskets | 80 |
| horses | 25 |
| field guns | 8 |

All three unit quantities start at zero. Campaign progress starts at campaign 1, enemy 1, current turn 1, zero completed campaigns, and zero waiting turns.

## Endless Campaign State

The active state is stored in `army_campaign_progress`:

```text
campaign_number
current_turn
current_enemy_sequence
current_faction
campaigns_completed
turns_on_current_enemy
```

Invariants maintained by normal game logic:

```text
campaign_number >= 1
current_enemy_sequence in 1..3
current_faction in liho, koi, bingxue
campaigns_completed = campaign_number - 1
turns_on_current_enemy >= 0
```

There is no active `campaign_template_id` and no `game_completed` field.

## Faction Selection and Enemy Generation

One faction is randomly selected and persisted when a campaign begins:

| Key | Name |
| --- | --- |
| `liho` | Duchy of Liho |
| `koi` | Koi Konfederacy |
| `bingxue` | Bingxue Commonwealth |

The faction does not change when state is read, a turn advances, or a battle resolves inside the same campaign. It changes only when enemy 3 is defeated and the next campaign begins, or when the player manually restarts the entire game.

`generateCurrentEnemy()` is deterministic from campaign number, enemy sequence, and faction key.

| Sequence | Title | Base strength | Weak against |
| ---: | --- | ---: | --- |
| 1 | Vanguard | 120 | infantry |
| 2 | Iron Host | 180 | cavalry |
| 3 | Grand Battery | 260 | artillery |

Generated IDs use:

```text
generated-c{campaignNumber}-e{enemySequence}-{factionKey}
```

Generated enemy rows are not persisted and do not need a foreign key.

## Universal Scaling

The shared campaign multiplier is:

```text
M = roundTo2Decimals(1 + (campaignNumber - 1) * 0.15)
```

Invalid or sub-1 campaign inputs passed directly to the helper are sanitized to campaign 1.

Examples:

| Campaign | M |
| ---: | ---: |
| 1 | 1.00 |
| 2 | 1.15 |
| 3 | 1.30 |
| 5 | 1.60 |
| 10 | 2.35 |

### Enemy scaling

```text
enemy fighting strength = round(sequence base strength * M)
```

### Turn scaling

Base production:

| Production | Base |
| --- | ---: |
| manpower | 25 |
| flour | 13 |
| supply | 14 |
| muskets | 8 |
| horses | 3 |
| field guns | 2 |

Each gain is individually rounded after multiplication by `M`.

### Battle reward scaling

On victory:

```text
manpower reward = round(10 * M)
ducat reward = round(40 * M)
supply reward = round(5 * M)
```

No separate final-campaign reward exists in active gameplay.

## Recruitment

Unit rules are seeded in `unit_types`:

| Unit | Strength | Manpower | Equipment | Qty | Flour upkeep | Supply upkeep | Battle supply |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| infantry | 10 | 10 | muskets | 10 | 3 | 1 | 1 |
| cavalry | 18 | 15 | horses | 5 | 3 | 1 | 1 |
| artillery | 28 | 20 | field guns | 2 | 1 | 2 | 3 |

For requested quantity `Q`:

```text
manpower cost = required manpower * Q
equipment cost = required equipment qty * Q
```

The equipment name is passed through a strict whitelist:

```text
muskets -> muskets
horses -> horses
field_guns -> fieldGuns
```

Unsupported and prototype-chain keys are rejected. Manpower deduction, equipment deduction, unit increase, and log insertion share one transaction. Exact spending is allowed; unaffordable recruitment returns `422` without mutation.

## Trading

| Item | Buy price | Sell price |
| --- | ---: | ---: |
| flour | 2 ducats | 1 ducat |
| supply | 3 ducats | 1 ducat |

```text
ducat amount = unit price * quantity
```

Buy deducts ducats and adds the item. Sell deducts the item and adds ducats. Exact spending is allowed. The resource update and trade log are transactional.

## Turn Resolution

The order for `advance-turn` is:

1. Calculate scaled production from campaign number.
2. Add flour and supply production.
3. Consume unit upkeep from the newly available amounts.
4. If available flour cannot cover upkeep, apply -5 morale.
5. Clamp morale to 0..100.
6. Add manpower and equipment production.
7. Increment `currentTurn`.
8. Increment `turnsOnCurrentEnemy`.
9. Write `turn_advanced` log.
10. If the waiting counter is at least 6, resolve enemy auto-attack in the same transaction.

Flour and supply consumption cannot drive stored values below zero.

## Enemy Auto-Attack

`ENEMY_ATTACK_AT_TURN` is 6. This is request-triggered; no timer, background process, WebSocket, or queue exists.

On the sixth preparation turn:

- that turn's production and upkeep happen first;
- an `enemy_auto_attack` log is written;
- battle uses updated resources;
- normal battle progression or defeat reset runs;
- `turnsOnCurrentEnemy` returns to 0.

## Fighting Strength

### Battle resource need

```text
flour needed = sum(quantity * flour upkeep)
supply needed = sum(quantity * battle supply cost)
```

### Player strength

```text
base strength = sum(quantity * base strength)
morale multiplier = 0.5 + morale / 100
counter multiplier = 1.10 if a positive-quantity weakness counter exists; otherwise 1.00
resource multiplier = 0.85 if flour or supply is insufficient; otherwise 1.00

player strength = floor(base * morale * counter * resource)
```

The player wins on an exact tie:

```text
player strength >= enemy strength -> victory
otherwise -> defeat
```

## Victory Classification and Casualties

```text
victory ratio = player strength / enemy strength
```

| Type | Ratio | Loss rate |
| --- | --- | ---: |
| pyrrhic | <= 1.10 | 20% |
| standard | > 1.10 and < 1.50 | 10% |
| decisive | >= 1.50 | 5% |

For each unit row:

```text
quantity lost = ceil(quantity before * loss rate)
quantity after = max(0, quantity before - quantity lost)
```

Any positive unit stack loses at least one unit. Defeat does not calculate partial casualties because it performs the full starter-state reset.

## Victory Progression

Victory first applies battle resource cost, scaled rewards, morale, and casualties.

If enemy sequence is 1 or 2:

```text
currentEnemySequence += 1
turnsOnCurrentEnemy = 0
faction remains unchanged
```

Logs: `battle_victory` and `enemy_defeated`.

If enemy sequence is 3:

```text
campaignNumber += 1
campaignsCompleted = campaignNumber - 1
currentEnemySequence = 1
currentFaction = random supported faction
turnsOnCurrentEnemy = 0
```

Logs: `battle_victory`, `campaign_completed`, and `campaign_started`.

The player can immediately continue turning, trading, recruiting, or battling. No route checks for final completion.

## Defeat and Manual Restart

### Defeat

Defeat:

- restores starter resources and equipment;
- resets every unit quantity to zero;
- resets enemy sequence and waiting counter;
- preserves campaign number, completed count, faction, and current turn;
- writes `battle_defeat`.

### Manual restart

Manual restart is a new game run on the same army identity. It resets resources, equipment, units, campaign number, completed count, current turn, enemy sequence, and waiting counter, then selects a new faction. Old logs are deleted and replaced with one `army_restarted` log.

## Logs

Current event types:

| Event | Written when |
| --- | --- |
| `campaign_started` | User creation or new campaign after enemy 3 |
| `campaign_completed` | Enemy 3 victory |
| `enemy_defeated` | Enemy 1 or 2 victory |
| `battle_victory` | Any victory |
| `battle_defeat` | Any defeat |
| `turn_advanced` | Each advanced turn |
| `enemy_auto_attack` | Sixth preparation turn triggers battle |
| `recruit` | Units recruited |
| `trade` | Resource trade |
| `army_restarted` | Manual restart |

`details` is stored as JSON text in SQLite but returned by the API as a nested object. Logs are returned newest first and may be filtered by exact event type and positive limit.

## Seeded Catalogue Boundary

`campaign_templates` and `campaign_template_enemies` remain seeded for:

- `GET /campaigns`;
- `GET /campaigns/:campaignId/enemies`;
- flavour/reference content.

They are not joined to `army_campaign_progress`, turn calculation, manual battle, or auto-attack. Their production and reward columns are read-only reference metadata, not active endless balance inputs.
