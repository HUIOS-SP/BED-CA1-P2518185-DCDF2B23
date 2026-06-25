# Leviathan Database Table Reference

The runtime schema is defined in `src/db/schema.js`. SQLite uses integer auto-increment primary keys and text columns. Drizzle exposes snake_case database columns as camelCase JavaScript properties where configured.

## Relationship Summary

```text
users 1---1 armies
             |---1 army_resources
             |---1 army_equipment
             |---* army_units *---1 unit_types
             |---1 army_campaign_progress
             |---* army_log

campaign_templates 1---* campaign_template_enemies
```

`campaign_templates` and `campaign_template_enemies` are a read-only flavour catalogue. Active endless progress intentionally has no foreign key to them because `campaign_number` is unbounded depth, not a template identifier.

## `users`

Player profile.

| Column | Type / key | Meaning |
| --- | --- | --- |
| `id` | integer PK, auto-increment | User identifier |
| `username` | text, unique, not null | Application-enforced maximum 50 characters |
| `created_at` | timestamp | Drizzle-generated creation time |
| `updated_at` | timestamp | Creation/update time |

Deleting a user cascades to their army, then all army-owned state.

## `armies`

Persistent army identity.

| Column | Type / key | Meaning |
| --- | --- | --- |
| `id` | integer PK | Army identifier |
| `user_id` | FK -> users, unique, not null | Enforces at most one army per user |
| `army_name` | text, not null | Application-enforced maximum 50 characters |
| `updated_at` | timestamp | Rename, restart, or defeat update |

Normal application flow creates the army transactionally with its user, producing exactly one army per user.

## `army_resources`

One mutable resource row per army.

| Column | Type / key | Default | Meaning |
| --- | --- | ---: | --- |
| `id` | integer PK | generated | Resource row identifier |
| `army_id` | FK -> armies, unique | none | Exactly one row per army |
| `manpower` | integer | 120 | Recruitment currency and turn/battle reward |
| `ducats` | integer | 180 | Trade currency and battle reward |
| `flour` | integer | 120 | Turn and battle upkeep |
| `supply` | integer | 100 | Turn and battle upkeep |
| `morale` | integer | 50 | Application-clamped to 0..100 |

Normal game logic prevents resource quantities from becoming negative.

## `army_equipment`

One fixed-shape equipment row per army. There is no `equipment_types` table.

| Column | Type / key | Default | JavaScript property |
| --- | --- | ---: | --- |
| `id` | integer PK | generated | `id` |
| `army_id` | FK -> armies, unique | none | `armyId` |
| `horses` | integer | 0 | `horses` |
| `field_guns` | integer | 0 | `fieldGuns` |
| `muskets` | integer | 0 | `muskets` |

The table defaults are zero, while application starter values are 25 horses, 8 field guns, and 80 muskets. Recruitment deducts from a validated direct column. Turn production adds to the same row. Restart and defeat update the row in place.

## `unit_types`

Seeded unit-rule catalogue.

| Column | Type / key | Meaning |
| --- | --- | --- |
| `id` | integer PK | Unit-type identifier |
| `unit_name` | text, unique | infantry, cavalry, artillery |
| `base_strength` | integer | Strength per recruited unit |
| `required_manpower` | integer | Recruitment manpower per unit |
| `required_equipment` | text | muskets, horses, field_guns |
| `required_equipment_qty` | integer, default 0 | Equipment consumed per unit |
| `flour_upkeep` | integer | Flour per unit per turn/battle |
| `supply_upkeep` | integer | Supply per unit per turn |
| `battle_supply_cost` | integer | Supply per unit per battle |

Seeded rows:

| Unit | Strength | Manpower | Equipment | Qty | Flour | Turn supply | Battle supply |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| infantry | 10 | 10 | muskets | 10 | 3 | 1 | 1 |
| cavalry | 18 | 15 | horses | 5 | 3 | 1 | 1 |
| artillery | 28 | 20 | field_guns | 2 | 1 | 2 | 3 |

## `army_units`

Quantities owned by an army.

| Column | Type / key | Meaning |
| --- | --- | --- |
| `id` | integer PK | Army-unit row identifier |
| `army_id` | FK -> armies | Owning army |
| `unit_type_id` | FK -> unit_types | Unit rule row |
| `quantity` | integer, default 0 | Current recruited quantity |

Unique index `(army_id, unit_type_id)` prevents duplicate rows. New/restarted/defeated armies have one row per unit type with quantity zero. Victory casualties update these rows.

## `army_campaign_progress`

The central endless game-state row.

| Column | Type / key | Default | Meaning |
| --- | --- | ---: | --- |
| `id` | integer PK | generated | Progress identifier |
| `army_id` | FK -> armies, unique | none | One progress row per army |
| `campaign_number` | integer | 1 | Unbounded campaign depth |
| `current_turn` | integer | 1 | Total turn number for the current run |
| `current_enemy_sequence` | integer | 1 | Application values 1, 2, or 3 |
| `current_faction` | text, not null | none | liho, koi, or bingxue |
| `campaigns_completed` | integer | 0 | Maintained as campaign number minus one |
| `turns_on_current_enemy` | integer | 0 | Waiting turns; 6 triggers auto-attack |
| `updated_at` | timestamp | generated | Last state update |

Notably absent:

- no `campaign_id` foreign key;
- no `game_completed` boolean;
- no persisted generated enemy row.

Current enemy details are derived at runtime from campaign number, sequence, and faction.

### Progress transitions

Enemy 1/2 victory:

```text
sequence += 1
waiting turns = 0
```

Enemy 3 victory:

```text
campaign number += 1
campaigns completed = campaign number - 1
sequence = 1
faction = newly selected faction
waiting turns = 0
```

Defeat preserves campaign number, completed count, faction, and current turn, but returns to sequence 1. Manual restart resets the whole progress row to campaign 1/current turn 1 and rerolls faction.

## `army_log`

General event journal.

| Column | Type / key | Meaning |
| --- | --- | --- |
| `id` | integer PK | Log identifier |
| `army_id` | FK -> armies | Owning army |
| `turn_number` | integer, nullable | Turn associated with event |
| `event_type` | text, not null | Search/filter category |
| `message` | text, not null | Human-readable description |
| `details` | JSON text, nullable | Event-specific data; returned by the API as a nested object |
| `created_at` | timestamp | Drizzle-generated insertion time |

Current application event types:

```text
campaign_started
campaign_completed
enemy_defeated
battle_victory
battle_defeat
turn_advanced
enemy_auto_attack
recruit
trade
army_restarted
```

Logs are read newest first. `eventType` filtering is exact after trimming. `limit` must be a positive integer.

## `campaign_templates`

Seeded flavour catalogue used only by `GET /campaigns`.

| Column | Type / key |
| --- | --- |
| `id` | integer PK |
| `campaign_number` | integer, unique |
| `campaign_name` | text, unique |
| `enemy_nation` | text |
| `description` | text, nullable |
| `major_reward_ducats` | integer, default 0 |
| `major_reward_manpower` | integer, default 0 |
| `major_reward_supply` | integer, default 0 |
| `major_reward_morale` | integer, default 0 |
| `manpower_gain_per_turn` | integer |
| `muskets_gain_per_turn` | integer |
| `horses_gain_per_turn` | integer |
| `field_guns_gain_per_turn` | integer |
| `flour_gain_per_turn` | integer |
| `supply_gain_per_turn` | integer |

The three seeded rows are Unix Wars, Conquest of Wayland, and War of the Daemons. Their stored production/rewards are catalogue data; active turn and battle calculations use global base values plus the universal multiplier.

## `campaign_template_enemies`

Seeded flavour enemies used only by `GET /campaigns/:campaignId/enemies`.

| Column | Type / key |
| --- | --- |
| `id` | integer PK |
| `campaign_template_id` | FK -> campaign_templates |
| `sequence` | integer |
| `enemy_name` | text |
| `fighting_strength` | integer |
| `weak_against_unit` | text, default none |
| `minor_reward_ducats` | integer, default 0 |
| `minor_reward_manpower` | integer, default 0 |
| `minor_reward_supply` | integer, default 0 |

Unique index `(campaign_template_id, sequence)` prevents duplicate positions. Active battles do not query this table.

## Foreign-Key Delete Behavior

| Parent deleted | Cascading result |
| --- | --- |
| users | army is deleted |
| armies | resources, equipment, units, progress, and logs are deleted |
| campaign_templates | seeded template enemy rows are deleted |

`unit_types` is referenced by `army_units` without cascade and should not be deleted during normal operation.

## Useful Debugging Queries

### Endless progress

```sql
SELECT
  users.username,
  armies.army_name,
  army_campaign_progress.campaign_number,
  army_campaign_progress.campaigns_completed,
  army_campaign_progress.current_turn,
  army_campaign_progress.current_enemy_sequence,
  army_campaign_progress.current_faction,
  army_campaign_progress.turns_on_current_enemy
FROM users
JOIN armies ON armies.user_id = users.id
JOIN army_campaign_progress ON army_campaign_progress.army_id = armies.id
WHERE users.id = 1;
```

The current enemy cannot be obtained by joining seeded campaign tables. Generate it using the progress values or read it through `GET /users/:userId/army/state`.

### Direct equipment

```sql
SELECT horses, field_guns, muskets
FROM army_equipment
WHERE army_id = 1;
```

### Units with rules

```sql
SELECT
  unit_types.unit_name,
  unit_types.required_equipment,
  army_units.quantity
FROM army_units
JOIN unit_types ON unit_types.id = army_units.unit_type_id
WHERE army_units.army_id = 1;
```

### Logs in insertion order

```sql
SELECT turn_number, event_type, message, details
FROM army_log
WHERE army_id = 1
ORDER BY id ASC;
```

### Singleton integrity

```sql
SELECT army_id, COUNT(*)
FROM army_equipment
GROUP BY army_id
HAVING COUNT(*) <> 1;
```

## Source of Truth

- `src/db/schema.js`: physical schema, keys, defaults, and cascades.
- `src/constants/gameBalance.js`: starting values, unit rules, and balance constants.
- `src/utils/campaignScaling.js`: universal scaling formula.
- `src/utils/enemyGenerator.js`: generated enemy templates and faction handling.
- `src/db/seed.js`: unit and flavour catalogue seeding.
- `dbml/leviathan.dbml`: ERD representation.
