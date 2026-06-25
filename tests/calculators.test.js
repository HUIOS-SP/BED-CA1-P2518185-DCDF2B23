import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkAndGetLimitFromQuery, checkAndGetOptionalPositiveInteger,
  checkAndGetOptionalPositiveIntegerFromQuery, checkAndGetPositiveInteger,
  checkIfNonEmptyString, checkIfPositiveInteger, getNumberWithinRange,
  getObjectValueOrDefault, getRequestBody, getValueOrDefault
} from '../src/utils/helper.js'
import {
  getCampaignDifficultyMultiplier,
  getSafeCampaignNumber
} from '../src/utils/campaignScaling.js'
import { generateCurrentEnemy, getRandomFactionKey } from '../src/utils/enemyGenerator.js'
import { getEquipmentColumnKey } from '../src/utils/equipment.js'
import {
  calculateEquipmentGain, calculateNextTurnsOnCurrentEnemy, calculateTurnResult,
  calculateUnitUpkeep, checkIfEnemyShouldAutoAttack, clampMorale,
  getSafeTurnsOnCurrentEnemy
} from '../src/utils/turnCalculator.js'
import {
  calculateBattleResolution, calculateBattleResourceCost,
  calculateMoraleMultiplier, calculatePlayerFightingStrength,
  calculateVictoryTroopLosses, checkIfArmyHasCounterUnit,
  determineBattleOutcome, determineVictoryType
} from '../src/utils/battleCalculator.js'
import {
  BATTLE_COUNTER_MULTIPLIER, BATTLE_LOW_RESOURCE_MULTIPLIER,
  ENEMY_FACTIONS, VICTORY_TYPE_DECISIVE, VICTORY_TYPE_PYRRHIC,
  VICTORY_TYPE_STANDARD
} from '../src/constants/gameBalance.js'

test('input helpers', async (t) => {
  await t.test('non-empty strings reject non-strings, blanks, and empty text', () => {
    for (const value of [undefined, null, 0, false, {}, [], '', '   ', '\n\t']) {
      assert.equal(checkIfNonEmptyString(value), false)
    }
    assert.equal(checkIfNonEmptyString(' x '), true)
  })

  await t.test('positive integer checks do not coerce values', () => {
    assert.equal(checkIfPositiveInteger(1), true)
    assert.equal(checkIfPositiveInteger(10), true)
    for (const value of [0, -1, 1.2, '1', NaN, Infinity, true, null]) {
      assert.equal(checkIfPositiveInteger(value), false)
    }
  })

  await t.test('positive integer parser accepts numeric strings but rejects unsafe coercions', () => {
    assert.equal(checkAndGetPositiveInteger(7), 7)
    assert.equal(checkAndGetPositiveInteger('7'), 7)
    assert.equal(checkAndGetPositiveInteger(' 7 '), 7)
    for (const value of [0, '0', -2, '1.5', 1.5, '', ' ', 'x', true, false, null, {}, [], [1]]) {
      assert.equal(checkAndGetPositiveInteger(value), null)
    }
  })

  await t.test('optional parser distinguishes omission from invalid input', () => {
    assert.equal(checkAndGetOptionalPositiveInteger(undefined), undefined)
    assert.equal(checkAndGetOptionalPositiveInteger('3'), 3)
    assert.equal(checkAndGetOptionalPositiveInteger('bad'), null)
  })

  await t.test('query parser sends the supplied 400 error', () => {
    const calls = []
    const res = { status(code) { calls.push(code); return this }, json(body) { calls.push(body); return this } }
    assert.equal(checkAndGetOptionalPositiveIntegerFromQuery(
      { query: { page: 'bad' } }, res, 'page', 'bad page'
    ), null)
    assert.deepEqual(calls, [400, { error: 'bad page' }])
    assert.equal(checkAndGetOptionalPositiveIntegerFromQuery(
      { query: {} }, res, 'page', 'bad page'
    ), undefined)
    assert.equal(checkAndGetLimitFromQuery({ query: { limit: '9' } }, res), 9)
  })

  await t.test('body and fallback helpers preserve valid falsy values', () => {
    assert.deepEqual(getRequestBody({}), {})
    assert.deepEqual(getRequestBody({ body: null }), {})
    assert.deepEqual(getRequestBody({ body: { x: 1 } }), { x: 1 })
    assert.equal(getValueOrDefault(0, 4), 0)
    assert.equal(getValueOrDefault(false, true), false)
    assert.equal(getValueOrDefault(null, 4), 4)
    assert.equal(getObjectValueOrDefault({ x: 0 }, 'x', 4), 0)
    assert.equal(getObjectValueOrDefault({}, 'x', 4), 4)
    assert.equal(getObjectValueOrDefault(null, 'x', 4), 4)
  })

  await t.test('range helper clamps both boundaries and preserves interior values', () => {
    assert.equal(getNumberWithinRange(-1, 0, 100), 0)
    assert.equal(getNumberWithinRange(101, 0, 100), 100)
    assert.equal(getNumberWithinRange(45, 0, 100), 45)
    assert.equal(getNumberWithinRange(0, 0, 100), 0)
    assert.equal(getNumberWithinRange(100, 0, 100), 100)
  })
})

test('campaign scaling and generated enemies', async (t) => {
  await t.test('scaling follows the universal curve and sanitizes invalid depths', () => {
    assert.equal(getCampaignDifficultyMultiplier(1), 1)
    assert.equal(getCampaignDifficultyMultiplier(2), 1.15)
    assert.equal(getCampaignDifficultyMultiplier(5), 1.6)
    assert.equal(getCampaignDifficultyMultiplier(10), 2.35)
    assert.equal(getCampaignDifficultyMultiplier(100), 15.85)
    for (const value of [0, -8, 1.5, undefined, null, 'bad', '4oops', Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(getSafeCampaignNumber(value), 1)
      assert.equal(getCampaignDifficultyMultiplier(value), 1)
    }
    assert.equal(getSafeCampaignNumber('4'), 4)
    assert.equal(getCampaignDifficultyMultiplier('4'), 1.45)
  })

  await t.test('all faction and sequence combinations generate valid deterministic enemies', () => {
    const weaknesses = new Set()
    for (const factionKey of Object.keys(ENEMY_FACTIONS)) {
      for (let enemySequence = 1; enemySequence <= 3; enemySequence += 1) {
        const input = { campaignNumber: 4, enemySequence, factionKey }
        const enemy = generateCurrentEnemy(input)
        assert.deepEqual(enemy, generateCurrentEnemy(input))
        assert.match(enemy.enemyArmyId, /^generated-c4-e[123]-(liho|koi|bingxue)$/)
        assert.equal(enemy.factionKey, factionKey)
        assert.equal(enemy.factionName, ENEMY_FACTIONS[factionKey].name)
        assert.equal(enemy.difficultyMultiplier, 1.45)
        assert.ok(Number.isInteger(enemy.fightingStrength))
        weaknesses.add(enemy.weakAgainstUnitType)
      }
    }
    assert.deepEqual([...weaknesses].sort(), ['artillery', 'cavalry', 'infantry'])
  })

  await t.test('enemy strength grows by sequence and campaign depth', () => {
    const strengths = [1, 2, 3].map((enemySequence) => generateCurrentEnemy({
      campaignNumber: 1, enemySequence, factionKey: 'liho'
    }).fightingStrength)
    assert.deepEqual(strengths, [120, 180, 260])
    assert.ok(generateCurrentEnemy({ campaignNumber: 10, enemySequence: 1, factionKey: 'liho' }).fightingStrength > strengths[0])
  })

  await t.test('invalid faction and sequence fail loudly', () => {
    assert.throws(() => generateCurrentEnemy({ campaignNumber: 1, enemySequence: 1, factionKey: 'unknown' }), /Unknown enemy faction/)
    for (const enemySequence of [0, 4, -1, undefined]) {
      assert.throws(() => generateCurrentEnemy({ campaignNumber: 1, enemySequence, factionKey: 'liho' }), /Unknown enemy sequence/)
    }
  })

  await t.test('random faction helper always returns a supported key', () => {
    for (let iteration = 0; iteration < 100; iteration += 1) {
      assert.ok(Object.hasOwn(ENEMY_FACTIONS, getRandomFactionKey()))
    }
  })
})

test('equipment mapping', async (t) => {
  await t.test('maps every persisted equipment name to a safe Drizzle property', () => {
    assert.equal(getEquipmentColumnKey('horses'), 'horses')
    assert.equal(getEquipmentColumnKey('muskets'), 'muskets')
    assert.equal(getEquipmentColumnKey('field_guns'), 'fieldGuns')
  })
  await t.test('rejects unsupported names and prototype-like keys', () => {
    for (const value of ['fieldGuns', 'HORSES', 'none', '__proto__', undefined, null]) {
      assert.equal(getEquipmentColumnKey(value), undefined)
    }
  })
})

test('turn calculator', async (t) => {
  await t.test('upkeep sums all units and treats nullish quantities as zero', () => {
    assert.deepEqual(calculateUnitUpkeep([
      { quantity: 2, flourUpkeep: 3, supplyUpkeep: 1 },
      { quantity: 3, flourUpkeep: 1, supplyUpkeep: 2 },
      { quantity: null, flourUpkeep: 999, supplyUpkeep: 999 }
    ]), { flour: 9, supply: 8 })
    assert.deepEqual(calculateUnitUpkeep([]), { flour: 0, supply: 0 })
  })

  await t.test('equipment gains use campaign scaling and stable rounding', () => {
    assert.deepEqual(calculateEquipmentGain(1), { horses: 3, fieldGuns: 2, muskets: 8 })
    assert.deepEqual(calculateEquipmentGain(2), { horses: 3, fieldGuns: 2, muskets: 9 })
    assert.deepEqual(calculateEquipmentGain(5), { horses: 5, fieldGuns: 3, muskets: 13 })
    assert.deepEqual(calculateEquipmentGain(10), { horses: 7, fieldGuns: 5, muskets: 19 })
  })

  await t.test('turn production happens before upkeep and preserves ducats', () => {
    const equipmentGain = calculateEquipmentGain(1)
    const result = calculateTurnResult({
      campaignNumber: 1, currentTurn: 7,
      resources: { manpower: 10, ducats: 99, flour: 1, supply: 2, morale: 50 },
      upkeep: { flour: 10, supply: 10 }, equipmentGain
    })
    assert.equal(result.turnNumber, 8)
    assert.equal(result.manpowerGained, 25)
    assert.equal(result.resources.manpower, 35)
    assert.equal(result.resources.ducats, 99)
    assert.equal(result.resources.flour, 4)
    assert.equal(result.resources.supply, 6)
    assert.equal(result.moraleChange, 0)
    assert.equal(Object.hasOwn(result, 'equipmentGainedSummary'), false)
  })

  await t.test('flour shortage applies morale penalty and clamps at zero', () => {
    const result = calculateTurnResult({
      campaignNumber: 1, currentTurn: 1,
      resources: { manpower: 0, ducats: 0, flour: 0, supply: 0, morale: 2 },
      upkeep: { flour: 100, supply: 100 }, equipmentGain: calculateEquipmentGain(1)
    })
    assert.equal(result.resources.flour, 0)
    assert.equal(result.resources.supply, 0)
    assert.equal(result.moraleChange, -5)
    assert.equal(result.resources.morale, 0)
  })

  await t.test('morale and enemy counters sanitize boundary values', () => {
    assert.equal(clampMorale(-5), 0)
    assert.equal(clampMorale(50), 50)
    assert.equal(clampMorale(105), 100)
    assert.equal(clampMorale('50'), 50)
    assert.equal(clampMorale('bad'), 0)
    for (const value of [undefined, null, -1, 1.5, 'bad']) assert.equal(getSafeTurnsOnCurrentEnemy(value), 0)
    assert.equal(getSafeTurnsOnCurrentEnemy('5'), 5)
    assert.equal(calculateNextTurnsOnCurrentEnemy(5), 6)
    assert.equal(calculateNextTurnsOnCurrentEnemy(-2), 1)
    assert.equal(checkIfEnemyShouldAutoAttack(5), false)
    assert.equal(checkIfEnemyShouldAutoAttack(6), true)
    assert.equal(checkIfEnemyShouldAutoAttack(7), true)
    assert.equal(checkIfEnemyShouldAutoAttack(2, 2), true)
  })
})

test('battle calculator', async (t) => {
  const units = [
    { armyUnitId: 1, unitName: 'infantry', quantity: 10, baseStrength: 10, flourUpkeep: 3, battleSupplyCost: 1 },
    { armyUnitId: 2, unitName: 'cavalry', quantity: 5, baseStrength: 18, flourUpkeep: 3, battleSupplyCost: 1 },
    { armyUnitId: 3, unitName: 'artillery', quantity: 2, baseStrength: 28, flourUpkeep: 1, battleSupplyCost: 3 }
  ]

  await t.test('battle resource cost sums flour and battle-specific supply', () => {
    assert.deepEqual(calculateBattleResourceCost(units), { flour: 47, supply: 21 })
    assert.deepEqual(calculateBattleResourceCost([]), { flour: 0, supply: 0 })
  })

  await t.test('counter detection requires a valid weakness and positive matching quantity', () => {
    assert.equal(checkIfArmyHasCounterUnit(units, 'infantry'), true)
    assert.equal(checkIfArmyHasCounterUnit(units, 'cavalry'), true)
    assert.equal(checkIfArmyHasCounterUnit([{ ...units[0], quantity: 0 }], 'infantry'), false)
    assert.equal(checkIfArmyHasCounterUnit(units, 'none'), false)
    assert.equal(checkIfArmyHasCounterUnit(units, 'invalid'), false)
  })

  await t.test('morale multiplier maps bounds and midpoint', () => {
    assert.equal(calculateMoraleMultiplier(0), 0.5)
    assert.equal(calculateMoraleMultiplier(50), 1)
    assert.equal(calculateMoraleMultiplier(100), 1.5)
    assert.equal(calculateMoraleMultiplier(-10), 0.5)
    assert.equal(calculateMoraleMultiplier(110), 1.5)
    assert.equal(calculateMoraleMultiplier('bad'), 0.5)
  })

  await t.test('player strength applies counter, morale, and low-resource multipliers', () => {
    const full = calculatePlayerFightingStrength({
      units, morale: 50, hasEnoughFlour: true, hasEnoughSupply: true, weakAgainstUnit: 'infantry'
    })
    assert.equal(full.baseStrength, 246)
    assert.equal(full.counterMultiplier, BATTLE_COUNTER_MULTIPLIER)
    assert.equal(full.fightingStrength, Math.floor(246 * BATTLE_COUNTER_MULTIPLIER))
    const low = calculatePlayerFightingStrength({
      units, morale: 50, hasEnoughFlour: false, hasEnoughSupply: true, weakAgainstUnit: 'none'
    })
    assert.equal(low.resourceMultiplier, BATTLE_LOW_RESOURCE_MULTIPLIER)
    assert.equal(low.fightingStrength, Math.floor(246 * BATTLE_LOW_RESOURCE_MULTIPLIER))
  })

  await t.test('outcome treats exact ties as victory', () => {
    assert.equal(determineBattleOutcome(100, 100), 'victory')
    assert.equal(determineBattleOutcome(99, 100), 'defeat')
    assert.equal(determineBattleOutcome(101, 100), 'victory')
  })

  await t.test('victory type honors ratio boundaries', () => {
    assert.equal(determineVictoryType(100, 100), VICTORY_TYPE_PYRRHIC)
    assert.equal(determineVictoryType(110, 100), VICTORY_TYPE_PYRRHIC)
    assert.equal(determineVictoryType(111, 100), VICTORY_TYPE_STANDARD)
    assert.equal(determineVictoryType(149, 100), VICTORY_TYPE_STANDARD)
    assert.equal(determineVictoryType(150, 100), VICTORY_TYPE_DECISIVE)
    assert.equal(determineVictoryType(1, 0), VICTORY_TYPE_DECISIVE)
  })

  await t.test('troop losses use victory rates, round upward, and never go negative', () => {
    const one = [{ armyUnitId: 1, unitName: 'infantry', quantity: 1 }]
    for (const victoryType of [VICTORY_TYPE_PYRRHIC, VICTORY_TYPE_STANDARD, VICTORY_TYPE_DECISIVE]) {
      const [loss] = calculateVictoryTroopLosses({ units: one, victoryType })
      assert.equal(loss.quantityLost, 1)
      assert.equal(loss.quantityAfter, 0)
    }
    const [zero] = calculateVictoryTroopLosses({ units: [{ ...one[0], quantity: 0 }], victoryType: VICTORY_TYPE_PYRRHIC })
    assert.equal(zero.quantityLost, 0)
  })

  await t.test('full resolution records generated enemy metadata and optional auto-attack context', () => {
    const enemy = generateCurrentEnemy({ campaignNumber: 1, enemySequence: 1, factionKey: 'liho' })
    const result = calculateBattleResolution({
      campaign: { campaignNumber: 1 }, enemy, units,
      resources: { flour: 100, supply: 100, morale: 50 },
      trigger: 'enemy_auto_attack', turnsOnCurrentEnemy: 6, enemyAttackAtTurn: 6
    })
    assert.equal(result.battleDetails.campaignName, 'Campaign 1')
    assert.equal(result.battleDetails.factionName, 'Duchy of Liho')
    assert.equal(result.battleDetails.weakAgainstUnit, 'infantry')
    assert.equal(result.battleDetails.turnsOnCurrentEnemy, 6)
    assert.equal(result.battleDetails.enemyAttackAtTurn, 6)
    assert.equal(result.battleDetails.outcome, result.outcome)
  })

  await t.test('defeat resolution has no victory type or troop losses', () => {
    const result = calculateBattleResolution({
      campaign: { campaignName: 'Impossible' },
      enemy: { enemyName: 'Wall', fightingStrength: 99999, weakAgainstUnit: 'none' },
      units: [], resources: { flour: 0, supply: 0, morale: 50 }, trigger: 'manual'
    })
    assert.equal(result.outcome, 'defeat')
    assert.equal(result.victoryType, null)
    assert.deepEqual(result.troopLosses, [])
  })
})
