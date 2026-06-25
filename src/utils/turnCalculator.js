import { getNumberWithinRange, getValueOrDefault } from './helper.js'
import { getCampaignDifficultyMultiplier } from './campaignScaling.js'
import {
  BASE_EQUIPMENT_GAIN_PER_TURN, BASE_RESOURCE_GAIN_PER_TURN,
  ENEMY_ATTACK_AT_TURN, LOW_FLOUR_MORALE_PENALTY, MORALE_MAX, MORALE_MIN
} from '../constants/gameBalance.js'

// Keeps morale inside the rules even if old or manually edited data gets weird
export function clampMorale(morale) {
  const number = Number(morale)
  if (!Number.isFinite(number)) return MORALE_MIN
  return getNumberWithinRange(number, MORALE_MIN, MORALE_MAX)
}

// Upkeep scales with owned quantities, so a larger army genuinely costs more to maintain
export function calculateUnitUpkeep(units) {
  return units.reduce((totals, unit) => {
    const quantity = getValueOrDefault(unit.quantity, 0)
    return {
      flour: totals.flour + quantity * unit.flourUpkeep,
      supply: totals.supply + quantity * unit.supplyUpkeep
    }
  }, { flour: 0, supply: 0 })
}

// Equipment production follows the same endless campaign multiplier as other production
export function calculateEquipmentGain(campaignNumber) {
  const multiplier = getCampaignDifficultyMultiplier(campaignNumber)
  return {
    horses: Math.round(BASE_EQUIPMENT_GAIN_PER_TURN.horses * multiplier),
    fieldGuns: Math.round(BASE_EQUIPMENT_GAIN_PER_TURN.fieldGuns * multiplier),
    muskets: Math.round(BASE_EQUIPMENT_GAIN_PER_TURN.muskets * multiplier)
  }
}

// Calculates the next turn without touching the database; pure math is easier to test
export function calculateTurnResult({ campaignNumber, currentTurn, resources, upkeep }) {
  const multiplier = getCampaignDifficultyMultiplier(campaignNumber)
  const manpowerGained = Math.round(BASE_RESOURCE_GAIN_PER_TURN.manpower * multiplier)
  const flourGained = Math.round(BASE_RESOURCE_GAIN_PER_TURN.flour * multiplier)
  const supplyGained = Math.round(BASE_RESOURCE_GAIN_PER_TURN.supply * multiplier)
  // Production arrives before upkeep, giving the army a fair shot at feeding itself
  const availableFlour = resources.flour + flourGained
  const availableSupply = resources.supply + supplyGained
  const flourConsumed = Math.min(availableFlour, upkeep.flour)
  const supplyConsumed = Math.min(availableSupply, upkeep.supply)
  const moraleChange = availableFlour < upkeep.flour ? LOW_FLOUR_MORALE_PENALTY : 0

  return {
    turnNumber: currentTurn + 1,
    campaignMultiplier: multiplier,
    manpowerGained,
    flourGained,
    supplyGained,
    flourConsumed,
    supplyConsumed,
    moraleChange,
    resources: {
      manpower: resources.manpower + manpowerGained,
      ducats: resources.ducats,
      flour: availableFlour - flourConsumed,
      supply: availableSupply - supplyConsumed,
      morale: clampMorale(resources.morale + moraleChange)
    }
  }
}

export function getSafeTurnsOnCurrentEnemy(value) {
  // Corrupt counters fall back to zero instead of instantly triggering an attack
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : 0
}

export function calculateNextTurnsOnCurrentEnemy(value) {
  return getSafeTurnsOnCurrentEnemy(value) + 1
}

export function checkIfEnemyShouldAutoAttack(value, threshold = ENEMY_ATTACK_AT_TURN) {
  // Once the threshold is reached, the enemy is done waiting, which seems fair enough
  return getSafeTurnsOnCurrentEnemy(value) >= threshold
}
