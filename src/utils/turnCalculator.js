import { getNumberWithinRange, getObjectValueOrDefault, getValueOrDefault } from '../../helper.js'
import {
  EQUIPMENT_GAIN_MULTIPLIERS,
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

// Calculates how much of each equipment type the army gains this turn.
export function calculateEquipmentGain(equipmentTypes, equipmentRate) {
  return equipmentTypes.map((equipmentType) => {
    const multiplier = getObjectValueOrDefault(
      EQUIPMENT_GAIN_MULTIPLIERS,
      equipmentType.equipmentName,
      1
    )

    return {
      equipmentTypeId: equipmentType.id,
      equipmentName: equipmentType.equipmentName,
      quantity: Math.max(1, Math.floor(equipmentRate * multiplier))
    }
  })
}

// Builds the full result of one successful turn advancement.
export function calculateTurnResult({ army, resources, upkeep, equipmentGain }) {
  const flourConsumed = Math.min(resources.flour, upkeep.flour)
  const supplyConsumed = Math.min(resources.supply, upkeep.supply)
  let moraleChange = 0

  if (resources.flour < upkeep.flour) {
    moraleChange = LOW_FLOUR_MORALE_PENALTY
  }

  return {
    dayNumber: army.currentDay + 1,
    manpowerGained: army.reinforcementRate,
    equipmentGainedSummary: JSON.stringify(equipmentGain),
    flourConsumed,
    supplyConsumed,
    moraleChange,
    resources: {
      manpower: resources.manpower + army.reinforcementRate,
      flour: resources.flour - flourConsumed,
      supply: resources.supply - supplyConsumed,
      morale: clampMorale(resources.morale + moraleChange)
    }
  }
}
