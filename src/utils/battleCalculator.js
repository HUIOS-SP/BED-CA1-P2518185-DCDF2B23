import { getValueOrDefault } from '../../helper.js'
import {
  BATTLE_COUNTER_MULTIPLIER,
  BATTLE_FULL_RESOURCE_MULTIPLIER,
  BATTLE_LOW_RESOURCE_MULTIPLIER,
  BATTLE_NO_COUNTER_MULTIPLIER,
  VALID_WEAKNESSES
} from '../constants/gameBalance.js'

// Adds up the flour and supply needed by all units for one battle.
export function calculateBattleResourceCost(units) {
  return units.reduce((total, unit) => {
    const quantity = getValueOrDefault(unit.quantity, 0)

    return {
      flour: total.flour + quantity * unit.flourUpkeep,
      supply: total.supply + quantity * unit.battleSupplyCost
    }
  }, { flour: 0, supply: 0 })
}

// Checks whether the army has at least one unit that counters the enemy weakness.
export function checkIfArmyHasCounterUnit(units, weakAgainstUnit) {
  if (!VALID_WEAKNESSES.includes(weakAgainstUnit)) {
    return false
  }

  if (weakAgainstUnit === 'none') {
    return false
  }

  const counterUnit = units.find((unit) => unit.unitName === weakAgainstUnit)

  if (!counterUnit) {
    return false
  }

  return counterUnit.quantity > 0
}

// Converts morale into a simple multiplier where 50 morale means normal strength.
export function calculateMoraleMultiplier(morale) {
  return 0.5 + morale / 100
}

// Calculates total player fighting strength for the current enemy.
export function calculatePlayerFightingStrength({
  units,
  morale,
  hasEnoughFlour,
  hasEnoughSupply,
  weakAgainstUnit
}) {
  const baseStrength = units.reduce((total, unit) => {
    const quantity = getValueOrDefault(unit.quantity, 0)
    return total + quantity * unit.baseStrength
  }, 0)

  let counterMultiplier = BATTLE_NO_COUNTER_MULTIPLIER
  const hasCounterUnit = checkIfArmyHasCounterUnit(units, weakAgainstUnit)

  if (hasCounterUnit) {
    counterMultiplier = BATTLE_COUNTER_MULTIPLIER
  }

  let resourceMultiplier = BATTLE_FULL_RESOURCE_MULTIPLIER

  if (!hasEnoughFlour || !hasEnoughSupply) {
    resourceMultiplier = BATTLE_LOW_RESOURCE_MULTIPLIER
  }

  const moraleMultiplier = calculateMoraleMultiplier(morale)
  const fightingStrength = Math.floor(
    baseStrength * moraleMultiplier * counterMultiplier * resourceMultiplier
  )

  return {
    fightingStrength,
    baseStrength,
    moraleMultiplier,
    counterMultiplier,
    resourceMultiplier,
    hasCounterUnit
  }
}

// Compares final fighting strength to decide whether the player wins.
export function determineBattleOutcome(playerFightingStrength, enemyFightingStrength) {
  if (playerFightingStrength >= enemyFightingStrength) {
    return 'victory'
  }

  return 'defeat'
}
