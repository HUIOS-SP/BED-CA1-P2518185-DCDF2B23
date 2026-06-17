import { getValueOrDefault } from './helper.js'
import {
  BATTLE_COUNTER_MULTIPLIER,
  BATTLE_DECISIVE_VICTORY_MIN_RATIO,
  BATTLE_DECISIVE_VICTORY_TROOP_LOSS_RATE,
  BATTLE_FULL_RESOURCE_MULTIPLIER,
  BATTLE_LOW_RESOURCE_MULTIPLIER,
  BATTLE_NO_COUNTER_MULTIPLIER,
  BATTLE_PYRRHIC_VICTORY_MAX_RATIO,
  BATTLE_PYRRHIC_VICTORY_TROOP_LOSS_RATE,
  BATTLE_STANDARD_VICTORY_TROOP_LOSS_RATE,
  VALID_WEAKNESSES,
  VICTORY_TYPE_DECISIVE,
  VICTORY_TYPE_PYRRHIC,
  VICTORY_TYPE_STANDARD
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
  // Base strength is the only part that depends on unit quantity and unit stats.
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
  // Floor keeps the API response as a whole number and avoids decimal fighting strength.
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

// Classifies how strong the victory was compared with the enemy strength.
export function determineVictoryType(playerFightingStrength, enemyFightingStrength) {
  if (enemyFightingStrength <= 0) {
    return VICTORY_TYPE_DECISIVE
  }

  // Victory ratio is only used after a win, so it does not compete with weakness logic.
  const victoryRatio = playerFightingStrength / enemyFightingStrength

  if (victoryRatio <= BATTLE_PYRRHIC_VICTORY_MAX_RATIO) {
    return VICTORY_TYPE_PYRRHIC
  }

  if (victoryRatio >= BATTLE_DECISIVE_VICTORY_MIN_RATIO) {
    return VICTORY_TYPE_DECISIVE
  }

  return VICTORY_TYPE_STANDARD
}

// Gets the starting loss rate for the victory type.
function getTroopLossRateForVictoryType(victoryType) {
  if (victoryType === VICTORY_TYPE_PYRRHIC) {
    return BATTLE_PYRRHIC_VICTORY_TROOP_LOSS_RATE
  }

  if (victoryType === VICTORY_TYPE_DECISIVE) {
    return BATTLE_DECISIVE_VICTORY_TROOP_LOSS_RATE
  }

  return BATTLE_STANDARD_VICTORY_TROOP_LOSS_RATE
}

// Calculates troop losses after a victory using the victory margin classification.
export function calculateVictoryTroopLosses({ units, victoryType }) {
  const troopLossRate = getTroopLossRateForVictoryType(victoryType)

  return units.map((unit) => {
    const quantityBefore = getValueOrDefault(unit.quantity, 0)
    let quantityLost = 0

    // ceil makes small armies still lose at least one soldier when casualties apply.
    if (quantityBefore > 0) {
      quantityLost = Math.ceil(quantityBefore * troopLossRate)
    }

    return {
      armyUnitId: unit.armyUnitId,
      unitName: unit.unitName,
      quantityBefore,
      victoryType,
      troopLossRate,
      quantityLost,
      quantityAfter: Math.max(0, quantityBefore - quantityLost)
    }
  })
}

// Builds every calculated value needed before the battle model writes database changes.
export function calculateBattleResolution({
  campaign,
  enemy,
  resources,
  units,
  trigger,
  turnsOnCurrentEnemy,
  enemyAttackAtTurn
}) {
  const battleCost = calculateBattleResourceCost(units)
  const hasEnoughFlour = resources.flour >= battleCost.flour
  const hasEnoughSupply = resources.supply >= battleCost.supply
  const playerStrength = calculatePlayerFightingStrength({
    units,
    morale: resources.morale,
    hasEnoughFlour,
    hasEnoughSupply,
    weakAgainstUnit: enemy.weakAgainstUnit
  })
  const outcome = determineBattleOutcome(
    playerStrength.fightingStrength,
    enemy.fightingStrength
  )
  let victoryType = null
  let troopLosses = []

  if (outcome === 'victory') {
    victoryType = determineVictoryType(
      playerStrength.fightingStrength,
      enemy.fightingStrength
    )
    troopLosses = calculateVictoryTroopLosses({
      units,
      victoryType
    })
  }

  const battleDetails = {
    trigger,
    campaignName: campaign.campaignName,
    enemyName: enemy.enemyName,
    enemyFightingStrength: enemy.fightingStrength,
    weakAgainstUnit: enemy.weakAgainstUnit,
    playerFightingStrength: playerStrength.fightingStrength,
    playerBaseStrength: playerStrength.baseStrength,
    moraleMultiplier: playerStrength.moraleMultiplier,
    counterMultiplier: playerStrength.counterMultiplier,
    resourceMultiplier: playerStrength.resourceMultiplier,
    hasCounterUnit: playerStrength.hasCounterUnit,
    flourNeeded: battleCost.flour,
    supplyNeeded: battleCost.supply,
    hasEnoughFlour,
    hasEnoughSupply,
    victoryType,
    troopLosses,
    outcome
  }

  if (turnsOnCurrentEnemy !== undefined) {
    battleDetails.turnsOnCurrentEnemy = turnsOnCurrentEnemy
  }

  if (enemyAttackAtTurn !== undefined) {
    battleDetails.enemyAttackAtTurn = enemyAttackAtTurn
  }

  return {
    battleCost,
    battleDetails,
    playerStrength,
    outcome,
    victoryType,
    troopLosses
  }
}
