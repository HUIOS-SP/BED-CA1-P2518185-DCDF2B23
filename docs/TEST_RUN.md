# Leviathan Interview Test Run

This guide completes one full campaign and demonstrates:

- health and catalogue reads
- user and starter-army creation
- resource trading
- unit recruitment
- turn advancement and upkeep
- two manual battles
- one enemy auto-attack
- campaign completion and endless progression
- army logs and cascade deletion

The first two enemies are fought manually. The third enemy attacks automatically
after six waiting turns and is defeated, completing campaign 1.

## Before the Interview

From the project root, prepare the database:

```bash
npm run db
```

Start the API:

```bash
npm start
```

Base Url:
```text
http://localhost:3000
```

For every request with a body, set:

```text
Content-Type: application/json
```

After creating the player, copy the returned `data.id`. Replace `{userId}` in
every later URL with that value.

The enemy faction is randomly selected, but enemy strength and weakness are
determined by enemy sequence. The numeric checkpoints in this guide are stable.

## 1. Check That the API Is Running

```http
GET http://localhost:3000/
```

Expected status: `200 OK`

```json
{
  "message": "Leviathan API is running"
}
```

## 2. Read the Campaign Catalogue

```http
GET http://localhost:3000/campaigns
```

Expected status: `200 OK`

Verify that `data` contains the three seeded campaign templates.

## 3. Create the Interview Player

Use a unique username if this test run has been performed before without
completing the cleanup step.

```http
POST http://localhost:3000/users
Content-Type: application/json
```

```json
{
  "username": "interview_player",
  "armyName": "Leviathan Interview Legion"
}
```

Expected status: `201 Created`

Record these values from the response:

- `data.id` as `{userId}`
- `data.army.id` as the army ID

## 4. Read the Starter State

```http
GET http://localhost:3000/users/{userId}/army/state
```

Verify the starter state:

| Category | Expected values |
| --- | --- |
| Resources | 120 manpower, 180 ducats, 120 flour, 100 supply, 50 morale |
| Equipment | 80 muskets, 25 horses, 8 field guns |
| Units | 0 infantry, 0 cavalry, 0 artillery |
| Progress | Campaign 1, turn 1, enemy sequence 1 |

The starting faction may be `liho`, `koi`, or `bingxue`.

## 5. Buy Supply

This demonstrates the trading system before recruitment begins.

```http
POST http://localhost:3000/users/{userId}/army/trade
Content-Type: application/json
```

```json
{
  "tradeType": "buy",
  "item": "supply",
  "quantity": 10
}
```

Verify that the remaining balances are:

```json
{
  "ducats": 150,
  "supply": 110
}
```

## 6. Recruit Four Infantry

Infantry counters enemy 1.

```http
POST http://localhost:3000/users/{userId}/army/recruit
Content-Type: application/json
```

```json
{
  "unitName": "infantry",
  "quantity": 4
}
```

Verify that 80 manpower and 40 muskets remain.

## 7. Recruit Four Artillery

```http
POST http://localhost:3000/users/{userId}/army/recruit
Content-Type: application/json
```

```json
{
  "unitName": "artillery",
  "quantity": 4
}
```

Verify that 0 manpower and 0 field guns remain.

## 8. Manually Fight Enemy 1

```http
POST http://localhost:3000/users/{userId}/army/battle
```

Verify the battle result:

| Field | Expected value |
| --- | --- |
| `data.trigger` | `manual` |
| `data.outcome` | `victory` |
| `data.victoryType` | `standard` |
| `data.player.fightingStrength` | `167` |
| `data.player.hasCounterUnit` | `true` |
| `data.player.counterMultiplier` | `1.1` |
| `data.campaignProgress.currentEnemySequence` | `2` |

## 9. Advance One Turn

```http
POST http://localhost:3000/users/{userId}/army/advance-turn
```

Verify:

- turn number is 2
- the enemy did not attack
- manpower is 35
- horses are 28

## 10. Recruit Two Cavalry

```http
POST http://localhost:3000/users/{userId}/army/recruit
Content-Type: application/json
```

```json
{
  "unitName": "cavalry",
  "quantity": 2
}
```

Verify that 5 manpower and 18 horses remain.

## 11. Advance Another Turn

```http
POST http://localhost:3000/users/{userId}/army/advance-turn
```

Verify that the turn number is 3, the enemy did not attack, and manpower is 30.

## 12. Recruit Two More Cavalry

The army now has the cavalry counter needed for enemy 2.

```http
POST http://localhost:3000/users/{userId}/army/recruit
Content-Type: application/json
```

```json
{
  "unitName": "cavalry",
  "quantity": 2
}
```

Verify that the army has 4 cavalry, 0 manpower, and 11 horses.

## 13. Manually Fight Enemy 2

```http
POST http://localhost:3000/users/{userId}/army/battle
```

Verify the battle result:

| Field | Expected value |
| --- | --- |
| `data.trigger` | `manual` |
| `data.outcome` | `victory` |
| `data.victoryType` | `standard` |
| `data.player.fightingStrength` | `208` |
| `data.player.hasCounterUnit` | `true` |
| `data.player.counterMultiplier` | `1.1` |
| `data.campaignProgress.currentEnemySequence` | `3` |

## 14. Prepare for Enemy 3

Advance three turns by sending this request three times:

```http
POST http://localhost:3000/users/{userId}/army/advance-turn
```

These requests reach turns 4, 5, and 6. Enemy 3's waiting counter reaches only
3, so it does not attack yet.

After the third request, verify:

| Field | Expected value |
| --- | ---: |
| Turn number | 6 |
| Manpower | 85 |
| Field guns | 10 |
| Flour | 64 |
| Supply | 111 |
| Morale | 54 |
| Enemy waiting turns | 3 |

## 15. Recruit Four More Artillery

This prepares the artillery counter before enemy 3 attacks.

```http
POST http://localhost:3000/users/{userId}/army/recruit
Content-Type: application/json
```

```json
{
  "unitName": "artillery",
  "quantity": 4
}
```

Verify that the army has 6 artillery, 5 manpower, and 2 field guns.

## 16. Advance Two More Turns

Send this request two times:

```http
POST http://localhost:3000/users/{userId}/army/advance-turn
```

These requests reach turns 7 and 8. The enemy waiting counter reaches 4 and
then 5, so neither request triggers the attack.

## 17. Trigger Enemy 3's Auto-Attack

Advance one final turn:

```http
POST http://localhost:3000/users/{userId}/army/advance-turn
```

This is the sixth waiting turn for enemy 3. The turn and battle are resolved
inside one transaction.

Verify the top-level turn result:

| Field | Expected value |
| --- | --- |
| `message` | `Turn advanced. The enemy attacked first.` |
| `data.turnNumber` | `9` |
| `data.enemyAttack.attacked` | `true` |

Verify the nested `data.battle` result:

| Field | Expected value |
| --- | --- |
| `trigger` | `enemy_auto_attack` |
| `outcome` | `victory` |
| `victoryType` | `pyrrhic` |
| `player.fightingStrength` | `276` |
| `campaignCompleted` | `true` |
| `campaignProgress.campaignNumber` | `2` |
| `campaignProgress.campaignsCompleted` | `1` |
| `campaignProgress.currentEnemySequence` | `1` |

## 18. Verify the Next Campaign

```http
GET http://localhost:3000/users/{userId}/army/state
```

Verify the final state:

| Category | Expected values |
| --- | --- |
| Resources | 90 manpower, 270 ducats, 19 flour, 84 supply, 56 morale |
| Equipment | 104 muskets, 29 horses, 8 field guns |
| Units | 1 infantry, 2 cavalry, 4 artillery |
| Progress | Campaign 2, turn 9, enemy sequence 1, 1 campaign completed |
| Waiting counter | 0 |

Campaign 2 receives a newly selected random faction.

## 19. Read the Event Journal

```http
GET http://localhost:3000/users/{userId}/army/logs?limit=25
```

The logs are returned newest-first. Verify that they include:

- `campaign_started`
- `trade`
- `recruit`
- `turn_advanced`
- `battle_victory`
- `enemy_defeated`
- `enemy_auto_attack`
- `campaign_completed`

## 20. Clean Up

Run this request last:

```http
DELETE http://localhost:3000/users/{userId}
```

Expected status: `204 No Content`

The user's army, resources, equipment, units, progress, and logs are deleted
through database cascade rules.
