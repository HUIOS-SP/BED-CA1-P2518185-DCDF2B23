# Leviathan API Endpoint Reference

Base URL during local development:

```text
http://localhost:3000
```

JSON and URL-encoded form bodies are supported. Gameplay routes identify the player using `userId`; authentication is outside the CA1 scope.

## Response Conventions

Successful application response:

```json
{
  "message": "Operation completed successfully.",
  "data": {}
}
```

Failure response:

```json
{
  "error": "Explanation of the error."
}
```

`DELETE /users/:userId` returns `204 No Content`. The health route returns only its message.

| Status | Use |
| --- | --- |
| 200 | Successful read, update, or gameplay action |
| 201 | User and starter game created |
| 204 | User deleted |
| 400 | Invalid input or forbidden client-selected battle target |
| 404 | Missing user, army, unit type, or campaign |
| 409 | Required gameplay state is missing or inconsistent |
| 422 | Valid gameplay request with insufficient resources/equipment |
| 500 | Unexpected server/database failure |

All URL IDs must be positive integers.

## Route Summary

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/` | Health check |
| GET | `/users` | List/filter users |
| POST | `/users` | Create user and starter game |
| GET | `/users/:userId` | Read public user profile |
| PUT | `/users/:userId` | Rename user |
| DELETE | `/users/:userId` | Delete user and all owned state |
| GET | `/users/:userId/army` | Read army identity |
| PUT | `/users/:userId/army` | Rename army |
| GET | `/users/:userId/army/state` | Read complete playable state |
| POST | `/users/:userId/army/restart` | Restart from campaign 1 |
| POST | `/users/:userId/army/recruit` | Recruit units |
| POST | `/users/:userId/army/trade` | Trade flour/supply |
| POST | `/users/:userId/army/advance-turn` | Apply production/upkeep and possible auto-attack |
| POST | `/users/:userId/army/battle` | Fight current generated enemy |
| GET | `/users/:userId/army/logs` | Read/filter event journal |
| GET | `/campaigns` | Read seeded campaign templates |
| GET | `/campaigns/:campaignId/enemies` | Read a template's seeded flavour enemies |

## Health

### `GET /`

Returns `200`:

```json
{ "message": "Leviathan API is running" }
```

## Users

### `GET /users`

Optional query:

| Field | Rules |
| --- | --- |
| `username` | Non-empty exact username; whitespace is trimmed |

`data` is an array of `{ id, username, createdAt, updatedAt }` objects.

### `POST /users`

Creates the user and starter army transactionally.

```json
{
  "username": "alice",
  "armyName": "First Legion"
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `username` | Yes | Non-empty string, trimmed, unique, maximum 50 characters |
| `armyName` | No | Non-empty string, trimmed, maximum 50 characters; defaults to `<username> Army` |

Returns `201` with the created user fields and army identity. The starter state is created in the same transaction but is read through `GET /users/:userId/army/state`.

### `GET /users/:userId`

Returns the public profile. Missing user: `404`.

### `PUT /users/:userId`

```json
{ "username": "alice-renamed" }
```

The username follows the same trim, length, and uniqueness rules. Reusing the same user's current username is allowed; another user's name returns `409`.

### `DELETE /users/:userId`

Returns `204`. Cascades to army, resources, equipment, units, progress, and logs.

## Army

### `GET /users/:userId/army`

Returns the army identity row only. It does not include resources or progress.

### `PUT /users/:userId/army`

```json
{ "armyName": "Northern Legion" }
```

`armyName` must be a non-empty string of at most 50 characters after trimming.

### `GET /users/:userId/army/state`

Returns complete state:

```json
{
  "army": {
    "id": 1,
    "armyName": "First Legion",
    "updatedAt": "2026-06-25T10:00:00.000Z"
  },
  "resources": {
    "manpower": 120,
    "ducats": 180,
    "flour": 120,
    "supply": 100,
    "morale": 50
  },
  "equipment": {
    "horses": 25,
    "fieldGuns": 8,
    "muskets": 80
  },
  "units": [
    {
      "unitName": "infantry",
      "quantity": 0,
      "baseStrength": 10,
      "requiredManpower": 10,
      "requiredEquipment": "muskets",
      "requiredEquipmentQty": 10,
      "flourUpkeep": 3,
      "supplyUpkeep": 1,
      "battleSupplyCost": 1
    },
    {
      "unitName": "cavalry",
      "quantity": 0,
      "baseStrength": 18,
      "requiredManpower": 15,
      "requiredEquipment": "horses",
      "requiredEquipmentQty": 5,
      "flourUpkeep": 3,
      "supplyUpkeep": 1,
      "battleSupplyCost": 1
    },
    {
      "unitName": "artillery",
      "quantity": 0,
      "baseStrength": 28,
      "requiredManpower": 20,
      "requiredEquipment": "field_guns",
      "requiredEquipmentQty": 2,
      "flourUpkeep": 1,
      "supplyUpkeep": 2,
      "battleSupplyCost": 3
    }
  ],
  "campaignProgress": {
    "campaignNumber": 1,
    "currentTurn": 1,
    "currentEnemySequence": 1,
    "currentFaction": "liho",
    "campaignsCompleted": 0,
    "turnsOnCurrentEnemy": 0,
    "currentEnemy": {
      "enemyName": "Duchy of Liho Vanguard",
      "factionName": "Duchy of Liho",
      "enemySequence": 1,
      "weakAgainstUnit": "infantry",
      "difficultyMultiplier": 1,
      "fightingStrength": 120
    }
  }
}
```

This example assumes the randomly selected faction is `liho`. Unit objects include their gameplay rule fields. Internal row IDs and foreign keys are not exposed. `currentEnemy` is generated from persisted progress and is stable across reads.

### `POST /users/:userId/army/restart`

Preserves the user, army ID, and army name. It:

- restores starter resources and the single equipment row;
- resets all unit quantities to zero;
- resets campaign number, current turn, enemy sequence, completed count, and enemy-turn counter;
- selects a new random faction;
- clears old logs and writes one `army_restarted` entry.

Restart can recreate missing resource, equipment, unit, or progress rows, but it does not recreate a missing army.

Response data contains only the reset progress summary:

```json
{
  "armyId": 1,
  "campaignNumber": 1,
  "currentTurn": 1,
  "currentEnemySequence": 1,
  "currentFaction": "liho",
  "campaignsCompleted": 0,
  "turnsOnCurrentEnemy": 0
}
```

## Recruitment

### `POST /users/:userId/army/recruit`

```json
{ "unitName": "infantry", "quantity": 2 }
```

| Field | Rules |
| --- | --- |
| `unitName` | Exact lowercase `infantry`, `cavalry`, or `artillery` |
| `quantity` | Positive integer; numeric form string accepted |

Costs per unit:

| Unit | Manpower | Equipment |
| --- | ---: | --- |
| infantry | 10 | 10 muskets |
| cavalry | 15 | 5 horses |
| artillery | 20 | 2 field guns |

Insufficient manpower or equipment returns `422`; no partial deduction occurs.

Response data reports the recruited quantity, costs, and affected balances:

```json
{
  "recruited": {
    "unitName": "infantry",
    "quantity": 2,
    "totalQuantity": 2
  },
  "spent": {
    "manpower": 20,
    "equipment": {
      "type": "muskets",
      "quantity": 20
    }
  },
  "remaining": {
    "manpower": 100,
    "equipment": {
      "type": "muskets",
      "quantity": 60
    }
  }
}
```

## Trading

### `POST /users/:userId/army/trade`

```json
{ "tradeType": "buy", "item": "flour", "quantity": 10 }
```

| Field | Rules |
| --- | --- |
| `tradeType` | Exact `buy` or `sell` |
| `item` | Exact `flour` or `supply` |
| `quantity` | Positive integer |

| Item | Buy price | Sell price |
| --- | ---: | ---: |
| flour | 2 ducats | 1 ducat |
| supply | 3 ducats | 1 ducat |

Exact spending is allowed. Insufficient ducats or item quantity returns `422`.

Response data contains the trade and the two affected balances:

```json
{
  "tradeType": "buy",
  "item": "flour",
  "quantity": 10,
  "pricePerUnit": 2,
  "ducatsChange": -20,
  "balances": {
    "ducats": 160,
    "flour": 130
  }
}
```

## Turns

### `POST /users/:userId/army/advance-turn`

No body. Applies scaled production, upkeep, morale changes, and increments `turnsOnCurrentEnemy`.

Normal response data includes:

```json
{
  "turnNumber": 2,
  "campaignMultiplier": 1,
  "gained": {
    "manpower": 25,
    "flour": 13,
    "supply": 14,
    "equipment": {
      "horses": 3,
      "fieldGuns": 2,
      "muskets": 8
    }
  },
  "consumed": {
    "flour": 0,
    "supply": 0
  },
  "moraleChange": 0,
  "resourceBalances": {
    "manpower": 145,
    "ducats": 180,
    "flour": 133,
    "supply": 114,
    "morale": 50
  },
  "equipmentBalances": {
    "horses": 28,
    "fieldGuns": 10,
    "muskets": 88
  },
  "enemyAttack": {
    "attacked": false,
    "attackAtTurn": 6,
    "turnsOnCurrentEnemy": 1
  },
  "campaignProgress": {
    "campaignNumber": 1,
    "currentTurn": 2,
    "currentEnemySequence": 1,
    "currentFaction": "liho",
    "campaignsCompleted": 0,
    "turnsOnCurrentEnemy": 1
  }
}
```

This example assumes campaign 1, faction `liho`, and zero recruited units, so no upkeep is consumed

At counter 6, production/upkeep is applied first and the generated enemy auto-attacks. The message changes to `Turn advanced. The enemy attacked first.` and `data.battle` describes the result.

There is no completed-game gate. Turns remain available at every campaign depth.

## Battle

### `POST /users/:userId/army/battle`

No body is needed. If `enemyArmyId` is provided, the route returns `400`; clients cannot select or skip enemies.

Response data includes outcome, enemy and player battle summaries, victory type, troop losses, resource balances, and compact updated campaign progress. It does not repeat the full army state.

```json
{
  "trigger": "manual",
  "outcome": "defeat",
  "campaignNumber": 1,
  "enemy": {
    "name": "Duchy of Liho Vanguard",
    "factionName": "Duchy of Liho",
    "fightingStrength": 120,
    "difficultyMultiplier": 1
  },
  "player": {
    "fightingStrength": 0,
    "hasCounterUnit": false,
    "counterMultiplier": 1,
    "resourceMultiplier": 1
  },
  "victoryType": null,
  "troopLosses": [],
  "armyReset": true,
  "campaignCompleted": false,
  "resourceBalances": {
    "manpower": 120,
    "ducats": 180,
    "flour": 120,
    "supply": 100,
    "morale": 50
  },
  "campaignProgress": {
    "campaignNumber": 1,
    "currentTurn": 1,
    "currentEnemySequence": 1,
    "currentFaction": "liho",
    "campaignsCompleted": 0,
    "turnsOnCurrentEnemy": 0
  }
}
```

This example shows the deterministic result of battling immediately with the empty starter army while the current faction is `liho`

Victory behavior:

- sequence 1 or 2 advances to the next sequence;
- sequence 3 increments campaign depth and completed count, selects the next faction, and begins sequence 1;
- battle rewards scale with the campaign multiplier;
- there is never a terminal completion flag.

Defeat behavior:

- restores starter resources/equipment/units;
- preserves campaign number, completed count, faction, and current turn;
- returns to enemy sequence 1.

## Response Scope

Mutation routes return action results, not full army snapshots:

- create returns the created user and army identity;
- recruit returns recruited quantity, costs, and remaining affected balances;
- trade returns the transaction and affected balances;
- advance-turn returns turn effects, balances, progress, and an optional battle result;
- battle returns combat and progression results;
- restart returns reset progress.

Use `GET /users/:userId/army/state` when the complete current state is required.

## Logs

### `GET /users/:userId/army/logs`

Optional queries:

| Field | Rules |
| --- | --- |
| `eventType` | Non-empty exact type, trimmed |
| `limit` | Positive integer |

Logs are returned newest first. Current event types include:

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

`details` is returned as a nested JSON object or `null`. SQLite stores it as text, and Drizzle handles serialization at the database boundary.
The owning `armyId` is omitted because it is already identified by the route.

## Seeded Catalogue

### `GET /campaigns`

Returns three seeded campaign templates in catalogue-number order with `id`, number, name, enemy nation, and description. Stored production and reward columns are read-only reference metadata. They are not exposed because active endless gameplay does not use them.

### `GET /campaigns/:campaignId/enemies`

Returns three seeded flavour enemies in sequence order without internal IDs, foreign keys, or stored reward metadata. Invalid ID: `400`; missing campaign: `404`.

The request flow is:

1. validate `campaignId` as a positive integer;
2. confirm that the campaign template exists;
3. query its enemy rows ordered by sequence;
4. format each row as `{ sequence, enemyName, fightingStrength, weakAgainstUnit }`;
5. send the standard success response.

Example `data` for campaign template 1:

```json
[
  {
    "sequence": 1,
    "enemyName": "Liho Border Guard",
    "fightingStrength": 75,
    "weakAgainstUnit": "artillery"
  },
  {
    "sequence": 2,
    "enemyName": "Liho Pike Regiment",
    "fightingStrength": 120,
    "weakAgainstUnit": "cavalry"
  },
  {
    "sequence": 3,
    "enemyName": "Liho Grand Battery",
    "fightingStrength": 175,
    "weakAgainstUnit": "infantry"
  }
]
```

These routes are deliberately separate from active endless gameplay. Manual battle and auto-attack use generated enemies, not these rows.
