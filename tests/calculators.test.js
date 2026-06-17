// BY AI
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkAndGetOptionalPositiveInteger,
  checkAndGetPositiveInteger,
  checkIfNonEmptyString,
  checkIfPositiveInteger,
  getNumberWithinRange,
  getObjectValueOrDefault,
  getRequestBody,
  getValueOrDefault
} from '../src/utils/helper.js'
import {
  BATTLE_TRIGGER_ENEMY_AUTO_ATTACK,
  CAMPAIGNS,
  ENEMY_ATTACK_AT_TURN,
} from '../src/constants/gameBalance.js'
import {
  calculateNextTurnsOnCurrentEnemy,
  calculateEquipmentGain,
  calculateTurnResult,
  calculateUnitUpkeep,
  checkIfCampaignProductionIsValid,
  checkIfEnemyShouldAutoAttack,
  clampMorale,
  getCampaignEquipmentGain,
  getSafeTurnsOnCurrentEnemy,
  resetTurnsOnCurrentEnemy
} from '../src/utils/turnCalculator.js'
import {
  calculateBattleResolution,
  calculateBattleResourceCost,
  calculateMoraleMultiplier,
  calculatePlayerFightingStrength,
  calculateVictoryTroopLosses,
  checkIfArmyHasCounterUnit,
  determineBattleOutcome,
  determineVictoryType
} from '../src/utils/battleCalculator.js'

test('helper functions validate common user input safely', async (t) => {
  await t.test('checkIfNonEmptyString accepts only strings with visible content', () => {
    assert.equal(checkIfNonEmptyString('abc'), true)
    assert.equal(checkIfNonEmptyString('  abc  '), true)
    assert.equal(checkIfNonEmptyString(''), false)
    assert.equal(checkIfNonEmptyString('   '), false)
    assert.equal(checkIfNonEmptyString(123), false)
    assert.equal(checkIfNonEmptyString(null), false)
  })

  await t.test('positive integer helpers reject zero, negatives, decimals, and text', () => {
    assert.equal(checkIfPositiveInteger(1), true)
    assert.equal(checkIfPositiveInteger(0), false)
    assert.equal(checkIfPositiveInteger(-1), false)
    assert.equal(checkIfPositiveInteger(1.5), false)

    assert.equal(checkAndGetPositiveInteger('12'), 12)
    assert.equal(checkAndGetPositiveInteger(12), 12)
    assert.equal(checkAndGetPositiveInteger('0'), null)
    assert.equal(checkAndGetPositiveInteger('-1'), null)
    assert.equal(checkAndGetPositiveInteger('1.5'), null)
    assert.equal(checkAndGetPositiveInteger('abc'), null)
  })

  await t.test('positive integer parsing rejects values JavaScript could coerce by accident', () => {
    assert.equal(checkAndGetPositiveInteger(true), null)
    assert.equal(checkAndGetPositiveInteger(false), null)
    assert.equal(checkAndGetPositiveInteger(null), null)
    assert.equal(checkAndGetPositiveInteger([]), null)
    assert.equal(checkAndGetPositiveInteger([1]), null)
    assert.equal(checkAndGetPositiveInteger({ value: 1 }), null)
    assert.equal(checkAndGetPositiveInteger(''), null)
    assert.equal(checkAndGetPositiveInteger('  '), null)
  })

  await t.test('optional positive integer allows missing values only', () => {
    assert.equal(checkAndGetOptionalPositiveInteger(undefined), undefined)
    assert.equal(checkAndGetOptionalPositiveInteger('7'), 7)
    assert.equal(checkAndGetOptionalPositiveInteger('0'), null)
  })

  await t.test('request body helper returns an empty object for missing bodies', () => {
    assert.deepEqual(getRequestBody({}), {})
    assert.deepEqual(getRequestBody({ body: null }), {})
    assert.deepEqual(getRequestBody({ body: { username: 'alice' } }), { username: 'alice' })
  })

  await t.test('default and range helpers handle nullish values but preserve zero', () => {
    assert.equal(getValueOrDefault(undefined, 5), 5)
    assert.equal(getValueOrDefault(null, 5), 5)
    assert.equal(getValueOrDefault(0, 5), 0)

    assert.equal(getObjectValueOrDefault(null, 'infantry', 9), 9)
    assert.equal(getObjectValueOrDefault(undefined, 'infantry', 9), 9)
    assert.equal(getObjectValueOrDefault({ infantry: 0 }, 'infantry', 9), 0)
    assert.equal(getObjectValueOrDefault({ infantry: null }, 'infantry', 9), 9)
    assert.equal(getObjectValueOrDefault({}, 'infantry', 9), 9)

    assert.equal(getNumberWithinRange(-5, 0, 100), 0)
    assert.equal(getNumberWithinRange(150, 0, 100), 100)
    assert.equal(getNumberWithinRange(50, 0, 100), 50)
  })
})

test('turn calculator handles upkeep, equipment gain, and morale bounds', async (t) => {
  await t.test('calculateUnitUpkeep treats missing and null quantities as zero', () => {
    const upkeep = calculateUnitUpkeep([
      { quantity: 2, flourUpkeep: 1, supplyUpkeep: 1 },
      { quantity: null, flourUpkeep: 100, supplyUpkeep: 100 },
      { flourUpkeep: 100, supplyUpkeep: 100 }
    ])

    assert.deepEqual(upkeep, {
      flour: 2,
      supply: 2
    })
  })

  await t.test('calculateEquipmentGain reads explicit values for all three campaigns', () => {
    const equipmentTypes = [
      { id: 1, equipmentName: 'muskets' },
      { id: 2, equipmentName: 'horses' },
      { id: 3, equipmentName: 'field_guns' },
      { id: 4, equipmentName: 'unknown_tool' }
    ]
    for (const campaign of CAMPAIGNS) {
      const equipmentGain = calculateEquipmentGain(equipmentTypes, campaign)
      assert.deepEqual(
        equipmentGain.map((gain) => gain.quantity),
        [
          campaign.musketsGainPerTurn,
          campaign.horsesGainPerTurn,
          campaign.fieldGunsGainPerTurn,
          0
        ]
      )
    }

    assert.equal(getCampaignEquipmentGain(CAMPAIGNS[0], 'unknown_tool'), 0)
  })

  await t.test('campaign production validation rejects unsafe database values', () => {
    for (const campaign of CAMPAIGNS) {
      assert.equal(checkIfCampaignProductionIsValid(campaign), true)
    }

    assert.equal(checkIfCampaignProductionIsValid(null), false)
    assert.equal(checkIfCampaignProductionIsValid({}), false)
    assert.equal(checkIfCampaignProductionIsValid({
      ...CAMPAIGNS[0],
      flourGainPerTurn: -1
    }), false)
    assert.equal(checkIfCampaignProductionIsValid({
      ...CAMPAIGNS[0],
      supplyGainPerTurn: 1.5
    }), false)
  })

  await t.test('calculateTurnResult adds camp production before consuming upkeep', () => {
    const result = calculateTurnResult({
      campaign: CAMPAIGNS[0],
      currentTurn: 4,
      resources: {
        manpower: 10,
        flour: 3,
        supply: 10,
        morale: 50
      },
      upkeep: {
        flour: 5,
        supply: 4
      },
      equipmentGain: [
        { equipmentTypeId: 1, equipmentName: 'muskets', quantity: 5 }
      ]
    })

    assert.equal(result.turnNumber, 5)
    assert.equal(result.manpowerGained, CAMPAIGNS[0].manpowerGainPerTurn)
    assert.equal(result.flourGained, CAMPAIGNS[0].flourGainPerTurn)
    assert.equal(result.supplyGained, CAMPAIGNS[0].supplyGainPerTurn)
    assert.equal(result.flourConsumed, 5)
    assert.equal(result.supplyConsumed, 4)
    assert.equal(result.moraleChange, 0)
    assert.deepEqual(result.resources, {
      manpower: 10 + CAMPAIGNS[0].manpowerGainPerTurn,
      flour: 3 + CAMPAIGNS[0].flourGainPerTurn - 5,
      supply: 10 + CAMPAIGNS[0].supplyGainPerTurn - 4,
      morale: 50
    })
  })

  await t.test('morale is clamped between zero and one hundred', () => {
    assert.equal(clampMorale(-1), 0)
    assert.equal(clampMorale(50), 50)
    assert.equal(clampMorale(101), 100)

    const lowMoraleTurn = calculateTurnResult({
      campaign: CAMPAIGNS[0],
      currentTurn: 1,
      resources: {
        manpower: 0,
        flour: 0,
        supply: 0,
        morale: 3
      },
      upkeep: {
        flour: CAMPAIGNS[0].flourGainPerTurn + 1,
        supply: CAMPAIGNS[0].supplyGainPerTurn + 1
      },
      equipmentGain: []
    })

    assert.equal(lowMoraleTurn.resources.morale, 0)
    assert.equal(lowMoraleTurn.flourConsumed, CAMPAIGNS[0].flourGainPerTurn)
    assert.equal(lowMoraleTurn.supplyConsumed, CAMPAIGNS[0].supplyGainPerTurn)
    assert.equal(lowMoraleTurn.moraleChange, -5)
  })

  await t.test('turn result does not apply morale penalty when flour exactly covers upkeep', () => {
    const result = calculateTurnResult({
      campaign: CAMPAIGNS[0],
      currentTurn: 2,
      resources: {
        manpower: 0,
        flour: 0,
        supply: 1,
        morale: 50
      },
      upkeep: {
        flour: CAMPAIGNS[0].flourGainPerTurn,
        supply: 10
      },
      equipmentGain: []
    })

    assert.equal(result.flourConsumed, CAMPAIGNS[0].flourGainPerTurn)
    assert.equal(
      result.supplyConsumed,
      Math.min(1 + CAMPAIGNS[0].supplyGainPerTurn, 10)
    )
    assert.equal(result.moraleChange, 0)
    assert.equal(result.resources.flour, 0)
    assert.equal(result.resources.morale, 50)
  })

  await t.test('enemy auto-attack counter helpers sanitize and reset values', () => {
    assert.equal(getSafeTurnsOnCurrentEnemy(null), 0)
    assert.equal(getSafeTurnsOnCurrentEnemy(undefined), 0)
    assert.equal(getSafeTurnsOnCurrentEnemy(-3), 0)
    assert.equal(getSafeTurnsOnCurrentEnemy(2.5), 0)
    assert.equal(getSafeTurnsOnCurrentEnemy(4), 4)

    assert.equal(calculateNextTurnsOnCurrentEnemy(null), 1)
    assert.equal(calculateNextTurnsOnCurrentEnemy(-10), 1)
    assert.equal(calculateNextTurnsOnCurrentEnemy(5), 6)
    assert.equal(resetTurnsOnCurrentEnemy(), 0)
  })

  await t.test('enemy auto-attack threshold only triggers at the configured limit', () => {
    assert.equal(checkIfEnemyShouldAutoAttack(ENEMY_ATTACK_AT_TURN - 1), false)
    assert.equal(checkIfEnemyShouldAutoAttack(ENEMY_ATTACK_AT_TURN), true)
    assert.equal(checkIfEnemyShouldAutoAttack(ENEMY_ATTACK_AT_TURN + 1), true)
    assert.equal(checkIfEnemyShouldAutoAttack(null), false)
    assert.equal(checkIfEnemyShouldAutoAttack(-1), false)
  })
})

test('battle calculator handles counters, resource penalties, and outcome boundaries', async (t) => {
  const units = [
    {
      unitName: 'infantry',
      quantity: 3,
      baseStrength: 10,
      flourUpkeep: 1,
      battleSupplyCost: 1
    },
    {
      unitName: 'artillery',
      quantity: 2,
      baseStrength: 28,
      flourUpkeep: 1,
      battleSupplyCost: 3
    }
  ]

  await t.test('calculateBattleResourceCost sums flour and battle supply costs', () => {
    const cost = calculateBattleResourceCost(units)

    assert.deepEqual(cost, {
      flour: 5,
      supply: 9
    })
  })

  await t.test('counter check only passes for valid weakness with owned quantity', () => {
    assert.equal(checkIfArmyHasCounterUnit(units, 'artillery'), true)
    assert.equal(checkIfArmyHasCounterUnit(units, 'cavalry'), false)
    assert.equal(checkIfArmyHasCounterUnit(units, 'none'), false)
    assert.equal(checkIfArmyHasCounterUnit(units, 'invalid'), false)

    const zeroQuantityUnits = [
      { unitName: 'artillery', quantity: 0 }
    ]

    assert.equal(checkIfArmyHasCounterUnit(zeroQuantityUnits, 'artillery'), false)
  })

  await t.test('morale multiplier maps 50 morale to normal strength', () => {
    assert.equal(calculateMoraleMultiplier(0), 0.5)
    assert.equal(calculateMoraleMultiplier(50), 1)
    assert.equal(calculateMoraleMultiplier(100), 1.5)
  })

  await t.test('player strength applies morale, counter, and resource multipliers', () => {
    const fullStrength = calculatePlayerFightingStrength({
      units,
      morale: 50,
      hasEnoughFlour: true,
      hasEnoughSupply: true,
      weakAgainstUnit: 'artillery'
    })

    assert.equal(fullStrength.baseStrength, 86)
    assert.equal(fullStrength.hasCounterUnit, true)
    assert.equal(fullStrength.counterMultiplier, 1.1)
    assert.equal(fullStrength.resourceMultiplier, 1)
    assert.equal(fullStrength.fightingStrength, 94)

    const lowResourceStrength = calculatePlayerFightingStrength({
      units,
      morale: 50,
      hasEnoughFlour: false,
      hasEnoughSupply: true,
      weakAgainstUnit: 'artillery'
    })

    assert.equal(lowResourceStrength.resourceMultiplier, 0.85)
    assert.equal(lowResourceStrength.fightingStrength, 80)
  })

  await t.test('player strength uses the same low-resource penalty if flour or supply is missing', () => {
    const noFlourStrength = calculatePlayerFightingStrength({
      units,
      morale: 50,
      hasEnoughFlour: false,
      hasEnoughSupply: true,
      weakAgainstUnit: 'none'
    })
    const noSupplyStrength = calculatePlayerFightingStrength({
      units,
      morale: 50,
      hasEnoughFlour: true,
      hasEnoughSupply: false,
      weakAgainstUnit: 'none'
    })
    const noResourcesStrength = calculatePlayerFightingStrength({
      units,
      morale: 50,
      hasEnoughFlour: false,
      hasEnoughSupply: false,
      weakAgainstUnit: 'none'
    })

    assert.equal(noFlourStrength.resourceMultiplier, 0.85)
    assert.equal(noSupplyStrength.resourceMultiplier, 0.85)
    assert.equal(noResourcesStrength.resourceMultiplier, 0.85)
    assert.equal(noFlourStrength.fightingStrength, noSupplyStrength.fightingStrength)
    assert.equal(noSupplyStrength.fightingStrength, noResourcesStrength.fightingStrength)
  })

  await t.test('battle outcome uses victory on exact tie', () => {
    assert.equal(determineBattleOutcome(80, 80), 'victory')
    assert.equal(determineBattleOutcome(79, 80), 'defeat')
    assert.equal(determineBattleOutcome(81, 80), 'victory')
  })

  await t.test('victory type is based on player strength compared with enemy strength', () => {
    assert.equal(determineVictoryType(100, 100), 'pyrrhic')
    assert.equal(determineVictoryType(110, 100), 'pyrrhic')
    assert.equal(determineVictoryType(111, 100), 'standard')
    assert.equal(determineVictoryType(120, 100), 'standard')
    assert.equal(determineVictoryType(149, 100), 'standard')
    assert.equal(determineVictoryType(150, 100), 'decisive')
    assert.equal(determineVictoryType(100, 0), 'decisive')
  })

  await t.test('victory troop losses use the victory type loss rate', () => {
    const troopLosses = calculateVictoryTroopLosses({
      victoryType: 'standard',
      units: [
        { armyUnitId: 1, unitName: 'infantry', quantity: 10 },
        { armyUnitId: 2, unitName: 'cavalry', quantity: 1 },
        { armyUnitId: 3, unitName: 'artillery', quantity: 0 }
      ]
    })

    assert.deepEqual(troopLosses, [
      {
        armyUnitId: 1,
        unitName: 'infantry',
        quantityBefore: 10,
        victoryType: 'standard',
        troopLossRate: 0.1,
        quantityLost: 1,
        quantityAfter: 9
      },
      {
        armyUnitId: 2,
        unitName: 'cavalry',
        quantityBefore: 1,
        victoryType: 'standard',
        troopLossRate: 0.1,
        quantityLost: 1,
        quantityAfter: 0
      },
      {
        armyUnitId: 3,
        unitName: 'artillery',
        quantityBefore: 0,
        victoryType: 'standard',
        troopLossRate: 0.1,
        quantityLost: 0,
        quantityAfter: 0
      }
    ])
  })

  await t.test('pyrrhic victories create heavier losses than decisive victories', () => {
    const units = [
      { armyUnitId: 1, unitName: 'infantry', quantity: 20 }
    ]

    const pyrrhicLosses = calculateVictoryTroopLosses({
      units,
      victoryType: 'pyrrhic'
    })
    const decisiveLosses = calculateVictoryTroopLosses({
      units,
      victoryType: 'decisive'
    })

    assert.equal(pyrrhicLosses[0].quantityLost, 4)
    assert.equal(decisiveLosses[0].quantityLost, 1)
  })

  await t.test('victory troop losses never reduce a unit below zero', () => {
    const troopLosses = calculateVictoryTroopLosses({
      victoryType: 'pyrrhic',
      units: [
        { armyUnitId: 1, unitName: 'infantry', quantity: 1 }
      ]
    })

    assert.equal(troopLosses[0].quantityLost, 1)
    assert.equal(troopLosses[0].quantityAfter, 0)
  })

  await t.test('battle resolution records enemy auto-attack trigger details', () => {
    const resolution = calculateBattleResolution({
      campaign: {
        campaignName: 'Unix Wars'
      },
      enemy: {
        enemyName: 'Liho Border Guard',
        fightingStrength: 80,
        weakAgainstUnit: 'artillery'
      },
      resources: {
        morale: 50,
        flour: 100,
        supply: 100
      },
      units,
      trigger: BATTLE_TRIGGER_ENEMY_AUTO_ATTACK,
      turnsOnCurrentEnemy: ENEMY_ATTACK_AT_TURN,
      enemyAttackAtTurn: ENEMY_ATTACK_AT_TURN
    })

    assert.equal(resolution.battleDetails.trigger, BATTLE_TRIGGER_ENEMY_AUTO_ATTACK)
    assert.equal(resolution.battleDetails.turnsOnCurrentEnemy, ENEMY_ATTACK_AT_TURN)
    assert.equal(resolution.battleDetails.enemyAttackAtTurn, ENEMY_ATTACK_AT_TURN)
    assert.equal(resolution.battleDetails.outcome, 'victory')
  })
})
