# Leviathan

Leviathan is a backend-only, endless turn-based army campaign game built for the ST0503 Backend Web Development CA1 assignment.

Players manage one persistent army, prepare through turns, recruit units, trade resources, and fight generated enemies across campaigns that increase in difficulty forever.

The project focuses on:

- REST API design
- Express MVC structure
- relational database modelling
- server-side validation
- transactional game actions
- automated route and calculator testing

Authentication, frontend work, migrations, and background jobs are outside the CA1 scope.

## Tech Stack

- Node.js
- Express 5
- Drizzle ORM
- libSQL / SQLite
- JavaScript ES modules
- Node.js test runner
- nodemon

The main request flow is:

```text
route -> middleware -> controller -> model -> Drizzle / SQLite
                              \-> calculator or response formatter
```

## Setup

Clone the repository and enter the project folder:

```bash
git clone https://github.com/HUIOS-SP/BED-CA1-P2518185-DCDF2B23.git Leviathan
cd Leviathan
```

Create a `.env` file:

```env
DATABASE_URL=file:./leviathan.db
PORT=3000
```

Install dependencies:

```bash
npm install
```

Apply the schema and seed catalogue data:

```bash
npm run db
```

Start the development server:

```bash
npm run dev
```

Run normally:

```bash
npm start
```

Run all tests:

```bash
npm test
```

The default URL is:

```text
http://localhost:3000
```

If an old local database conflicts with the schema, delete `leviathan.db` and run `npm run db` again.

## Seed Data and Starter State

`npm run db` seeds read-only catalogue data:

- infantry, cavalry, and artillery unit rules
- three campaign template rows
- three example enemy rows per campaign template

Starter resources, equipment, units, progress, and the first log are not standalone seed rows. They are created transactionally whenever `POST /users` creates a user and army.

Starter gameplay state:

```text
resources: manpower 120, ducats 180, flour 120, supply 100, morale 50
equipment: muskets 80, horses 25, field guns 8
units: infantry 0, cavalry 0, artillery 0
progress: campaign 1, turn 1, enemy 1, completed campaigns 0, waiting turns 0
```

The campaign template production and reward columns remain seeded as read-only reference metadata. Active endless gameplay does not read those columns, and the catalogue API does not expose them.

## Core Gameplay Loop

```text
Create user
-> receive starter army
-> campaign 1 begins with a random faction
-> prepare through turns, trade, and recruitment
-> fight enemy 1
-> fight enemy 2
-> fight enemy 3
-> campaign number increases
-> a new faction is selected
-> difficulty increases
-> repeat forever
```

Each campaign has three generated enemies. There is no final campaign and no `gameCompleted` state.

## Endless Progression

The active enemy is generated from:

```text
campaignNumber + currentEnemySequence + currentFaction
```

Stored progress contains:

```text
campaignNumber
currentTurn
currentEnemySequence
currentFaction
campaignsCompleted
turnsOnCurrentEnemy
```

The faction is selected when a campaign begins and remains stable during that campaign.

After enemy 3 is defeated:

```text
campaignNumber += 1
campaignsCompleted = campaignNumber - 1
currentEnemySequence = 1
currentFaction = new random faction
turnsOnCurrentEnemy = 0
```

Defeat resets resources, equipment, and units to starter values. It preserves campaign depth, faction, completed count, and current turn, then returns to enemy 1.

## Difficulty Scaling

One multiplier scales endless gameplay:

```text
multiplier = 1 + (campaignNumber - 1) * 0.15
```

| Campaign | Multiplier |
| ---: | ---: |
| 1 | 1.00x |
| 2 | 1.15x |
| 5 | 1.60x |
| 10 | 2.35x |

It scales:

- generated enemy strength
- turn resource production
- turn equipment production
- victory rewards

## Generated Enemies

| Sequence | Title | Base strength | Weak against |
| ---: | --- | ---: | --- |
| 1 | Vanguard | 120 | infantry |
| 2 | Iron Host | 180 | cavalry |
| 3 | Grand Battery | 260 | artillery |

Available factions:

| Key | Name |
| --- | --- |
| `liho` | Duchy of Liho |
| `koi` | Koi Konfederacy |
| `bingxue` | Bingxue Commonwealth |

Generated enemies are deterministic for the same campaign number, sequence, and faction. They are not stored as database rows.

## Turn Rules

Each turn:

1. calculates scaled production
2. adds flour and supply production
3. consumes unit upkeep
4. applies a morale penalty if flour is insufficient
5. adds manpower and equipment production
6. increments the turn and enemy waiting counter
7. triggers an enemy auto-attack when the counter reaches 6

Morale stays between `0` and `100`.

## Battle Rules

```text
base strength = sum(unit quantity * unit base strength)
morale multiplier = 0.5 + morale / 100
counter multiplier = 1.10 when a matching counter unit exists
resource multiplier = 0.85 when flour or supply is insufficient
```

An exact strength tie is a victory.

| Victory type | Ratio | Casualty rate |
| --- | --- | ---: |
| Pyrrhic | up to 1.10 | 20% |
| Standard | above 1.10 and below 1.50 | 10% |
| Decisive | 1.50 or above | 5% |

## API Overview

### Health

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/` | Check that the API server is running |

### Users

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/users?username=` | List or filter users |
| POST | `/users` | Create a user and starter army |
| GET | `/users/:userId` | Read one user |
| PUT | `/users/:userId` | Rename a user |
| DELETE | `/users/:userId` | Delete the user and owned state |

### Army and Gameplay

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/users/:userId/army` | Read army identity |
| PUT | `/users/:userId/army` | Rename the army |
| GET | `/users/:userId/army/state` | Read the complete gameplay state |
| POST | `/users/:userId/army/restart` | Restart from campaign 1 |
| POST | `/users/:userId/army/recruit` | Recruit units |
| POST | `/users/:userId/army/trade` | Buy or sell flour and supply |
| POST | `/users/:userId/army/advance-turn` | Apply a turn and possible auto-attack |
| POST | `/users/:userId/army/battle` | Fight the current generated enemy |
| GET | `/users/:userId/army/logs?eventType=&limit=` | Read the event journal |

### Read-Only Catalogue

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/campaigns` | Read campaign template identity and description |
| GET | `/campaigns/:campaignId/enemies` | Read ordered example enemies |

Catalogue routes are informational. Active battles use generated enemies, not catalogue enemy rows.

## Response Format

Successful application responses use:

```json
{
  "message": "Action completed successfully.",
  "data": {}
}
```

Errors use:

```json
{
  "error": "Explanation of the error."
}
```

`DELETE /users/:userId` returns `204 No Content`.

Gameplay mutations return focused action results. They do not repeat the full army state. Use `GET /users/:userId/army/state` when a complete snapshot is required.

## Example Responses

The examples below assume the randomly selected faction is `liho`.

### Create User

`POST /users`

```json
{
  "username": "player",
  "armyName": "First Army"
}
```

```json
{
  "message": "User created successfully. Starting army and endless campaign created.",
  "data": {
    "id": 1,
    "username": "player",
    "createdAt": "2026-06-25T10:00:00.000Z",
    "updatedAt": "2026-06-25T10:00:00.000Z",
    "army": {
      "id": 1,
      "armyName": "First Army",
      "updatedAt": "2026-06-25T10:00:00.000Z"
    }
  }
}
```

### Complete Army State

`GET /users/1/army/state`

```json
{
  "message": "Army state retrieved successfully.",
  "data": {
    "army": {
      "id": 1,
      "armyName": "First Army",
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
}
```

### Recruit Two Infantry

`POST /users/1/army/recruit`

```json
{
  "unitName": "infantry",
  "quantity": 2
}
```

```json
{
  "message": "Units recruited successfully.",
  "data": {
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
}
```

### Advance an Empty Army by One Turn

`POST /users/1/army/advance-turn`

```json
{
  "message": "Turn advanced successfully.",
  "data": {
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
}
```

### Manual Battle with an Empty Starter Army

`POST /users/1/army/battle`

```json
{
  "message": "Battle resolved successfully.",
  "data": {
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
}
```

## Status Codes

| Status | Meaning |
| ---: | --- |
| 200 | Successful read, update, or gameplay action |
| 201 | User and starter army created |
| 204 | User deleted |
| 400 | Invalid input or forbidden client-selected enemy |
| 404 | User, army, unit type, or catalogue campaign not found |
| 409 | Required gameplay state is missing or inconsistent |
| 422 | Valid action cannot be afforded |
| 500 | Unexpected server or database error |

## Testing

The suite currently contains 130 passing tests covering:

- user CRUD and validation
- transactional starter creation
- army state and focused mutation responses
- recruitment and trading
- turn production and upkeep
- enemy auto-attacks
- battle outcomes and casualties
- endless progression
- restart and missing-state recovery
- logs and catalogue routes
- uniqueness, cascade, and foreign-key behavior
- calculator and helper edge cases

## Project Structure

```text
.
|-- README.md
|-- index.js
|-- drizzle.config.js
|-- package.json
|-- docs
|   |-- API_ENDPOINTS.md
|   |-- TEST_RUN.md
|   |-- database.dbml
|   |-- MECHANICS.md
|   `-- TABLES_ABOUT.md
|-- tests
|   |-- api.test.js
|   `-- calculators.test.js
`-- src
    |-- constants
    |   |-- gameBalance.js
    |   `-- validation.js
    |-- controllers
    |   |-- armyLogController.js
    |   |-- battleController.js
    |   |-- campaignController.js
    |   |-- recruitController.js
    |   |-- tradeController.js
    |   |-- turnController.js
    |   |-- userArmyController.js
    |   `-- userController.js
    |-- db
    |   |-- db.js
    |   |-- schema.js
    |   `-- seed.js
    |-- middleware
    |   |-- campaignMiddleware.js
    |   |-- response.js
    |   `-- userMiddleware.js
    |-- models
    |   |-- armyLogModel.js
    |   |-- battleModel.js
    |   |-- campaignModel.js
    |   |-- recruitModel.js
    |   |-- tradeModel.js
    |   |-- turnModel.js
    |   |-- userArmyModel.js
    |   `-- userModel.js
    |-- routes
    |   |-- armyRoutes.js
    |   |-- campaignRoutes.js
    |   `-- userRoutes.js
    `-- utils
        |-- battleCalculator.js
        |-- campaignScaling.js
        |-- enemyGenerator.js
        |-- equipment.js
        |-- helper.js
        |-- responseFormatter.js
        `-- turnCalculator.js
```

## Further Documentation

- [API endpoint reference](docs/API_ENDPOINTS.md)
- [Gameplay mechanics](docs/MECHANICS.md)
- [Interview test run](docs/TEST_RUN.md)
- [Database table reference](docs/TABLES_ABOUT.md)
- [Database relationship diagram (DBML)](docs/database.dbml)

## CA1 Design Boundaries and Assumptions

- one user owns exactly one army
- authentication and frontend work are excluded
- generated enemies support endless depth without infinite database rows
- campaign templates are read-only catalogue data
- equipment uses one fixed-shape row per army
- gameplay mutations return focused action results
- `/army/state` is the single complete gameplay-state read
- enemy auto-attacks are turn-triggered rather than timer-based
