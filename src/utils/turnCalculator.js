import { getNumberWithinRange, getValueOrDefault } from './helper.js'
import {
  ENEMY_ATTACK_AT_TURN,
  LOW_FLOUR_MORALE_PENALTY,
  MORALE_MAX,
  MORALE_MIN
} from '../constants/gameBalance.js'

// Keeps morale inside the allowed range.
export function clampMorale(morale) {
  return getNumberWithinRange(morale, MORALE_MIN, MORALE_MAX)
}

// Adds up the food and supply cost of all recruited units.
export function calculateUnitUpkeep(units) {
  return units.reduce((totals, unit) => {
    const quantity = getValueOrDefault(unit.quantity, 0)

    return {
      flour: totals.flour + quantity * unit.flourUpkeep,
      supply: totals.supply + quantity * unit.supplyUpkeep
    }
  }, { flour: 0, supply: 0 })
}

// Reads one explicit equipment gain from the current campaign row.
export function getCampaignEquipmentGain(campaign, equipmentName) {
  if (equipmentName === 'muskets') {
    return campaign.musketsGainPerTurn
  }

  if (equipmentName === 'horses') {
    return campaign.horsesGainPerTurn
  }

  if (equipmentName === 'field_guns') {
    return campaign.fieldGunsGainPerTurn
  }

  return 0
}

// Confirms every campaign production value is a non-negative whole number.
export function checkIfCampaignProductionIsValid(campaign) {
  if (!campaign) {
    return false
  }

  const productionValues = [
    campaign.manpowerGainPerTurn,
    campaign.musketsGainPerTurn,
    campaign.horsesGainPerTurn,
    campaign.fieldGunsGainPerTurn,
    campaign.flourGainPerTurn,
    campaign.supplyGainPerTurn
  ]

  return productionValues.every((value) => Number.isInteger(value) && value >= 0)
}

// Builds equipment gains directly from the current campaign's production values.
export function calculateEquipmentGain(equipmentTypes, campaign) {
  return equipmentTypes.map((equipmentType) => {
    return {
      equipmentTypeId: equipmentType.id,
      equipmentName: equipmentType.equipmentName,
      quantity: getCampaignEquipmentGain(campaign, equipmentType.equipmentName)
    }
  })
}

// Builds the full result of one successful turn advancement.
export function calculateTurnResult({ campaign, currentTurn, resources, upkeep, equipmentGain }) {
  // Camp production is added first so the new resources can pay this turn's upkeep.
  const flourGained = campaign.flourGainPerTurn
  const supplyGained = campaign.supplyGainPerTurn
  const availableFlour = resources.flour + flourGained
  const availableSupply = resources.supply + supplyGained
  const flourConsumed = Math.min(availableFlour, upkeep.flour)
  const supplyConsumed = Math.min(availableSupply, upkeep.supply)
  let moraleChange = 0

  if (availableFlour < upkeep.flour) {
    moraleChange = LOW_FLOUR_MORALE_PENALTY
  }

  const updatedResources = {
    manpower: resources.manpower + campaign.manpowerGainPerTurn,
    flour: availableFlour - flourConsumed,
    supply: availableSupply - supplyConsumed,
    morale: clampMorale(resources.morale + moraleChange)
  }

  // Ducats do not change during normal turn upkeep, but auto-battle needs the full resource row.
  if (resources.ducats !== undefined) {
    updatedResources.ducats = resources.ducats
  }

  return {
    turnNumber: currentTurn + 1,
    manpowerGained: campaign.manpowerGainPerTurn,
    equipmentGainedSummary: JSON.stringify(equipmentGain),
    flourGained,
    supplyGained,
    flourConsumed,
    supplyConsumed,
    moraleChange,
    resources: updatedResources
  }
}

// Existing rows should never have a negative counter, but this keeps old/manual data safe.
export function getSafeTurnsOnCurrentEnemy(turnsOnCurrentEnemy) {
  const number = Number(turnsOnCurrentEnemy)

  if (!Number.isInteger(number) || number < 0) {
    return 0
  }

  return number
}

// Counts one more preparation turn against the current enemy.
export function calculateNextTurnsOnCurrentEnemy(turnsOnCurrentEnemy) {
  return getSafeTurnsOnCurrentEnemy(turnsOnCurrentEnemy) + 1
}

// Central reset helper keeps all battle/restart paths consistent.
export function resetTurnsOnCurrentEnemy() {
  return 0
}

// Decides whether the current enemy should attack after the turn counter increases.
export function checkIfEnemyShouldAutoAttack(
  turnsOnCurrentEnemy,
  enemyAttackAtTurn = ENEMY_ATTACK_AT_TURN
) {
  return getSafeTurnsOnCurrentEnemy(turnsOnCurrentEnemy) >= enemyAttackAtTurn
}
