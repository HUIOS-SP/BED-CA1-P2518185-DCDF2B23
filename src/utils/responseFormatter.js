// Response formatters control what leaves the API, with public fields in and internal IDs out
export function toArmyView(army) {
  return {
    id: army.id,
    armyName: army.armyName,
    updatedAt: army.updatedAt
  }
}

function toResourcesView(resources) {
  return {
    manpower: resources.manpower,
    ducats: resources.ducats,
    flour: resources.flour,
    supply: resources.supply,
    morale: resources.morale
  }
}

function toEquipmentView(equipment) {
  return {
    horses: equipment.horses,
    fieldGuns: equipment.fieldGuns,
    muskets: equipment.muskets
  }
}

function toUnitView(unit) {
  return {
    unitName: unit.unitName,
    quantity: unit.quantity,
    baseStrength: unit.baseStrength,
    requiredManpower: unit.requiredManpower,
    requiredEquipment: unit.requiredEquipment,
    requiredEquipmentQty: unit.requiredEquipmentQty,
    flourUpkeep: unit.flourUpkeep,
    supplyUpkeep: unit.supplyUpkeep,
    battleSupplyCost: unit.battleSupplyCost
  }
}

export function toCampaignProgressSummary(progress) {
  return {
    campaignNumber: progress.campaignNumber,
    currentTurn: progress.currentTurn,
    currentEnemySequence: progress.currentEnemySequence,
    currentFaction: progress.currentFaction,
    campaignsCompleted: progress.campaignsCompleted,
    turnsOnCurrentEnemy: progress.turnsOnCurrentEnemy
  }
}

function toCampaignProgressView(progress) {
  const enemy = progress.currentEnemy
  let weakAgainstUnit = enemy.weakAgainstUnitType

  // Generated enemies use weakAgainstUnitType; the fallback keeps older data readable
  if (weakAgainstUnit === undefined) {
    weakAgainstUnit = enemy.weakAgainstUnit
  }

  return {
    ...toCampaignProgressSummary(progress),
    currentEnemy: {
      enemyName: enemy.enemyName,
      factionName: enemy.factionName,
      enemySequence: enemy.enemySequence,
      weakAgainstUnit,
      difficultyMultiplier: enemy.difficultyMultiplier,
      fightingStrength: enemy.fightingStrength
    }
  }
}

export function toArmyStateView(state) {
  // This is intentionally the only formatter that returns the complete gameplay snapshot
  return {
    army: toArmyView(state.army),
    resources: toResourcesView(state.resources),
    equipment: toEquipmentView(state.equipment),
    units: state.units.map(toUnitView),
    campaignProgress: toCampaignProgressView(state.campaignProgress)
  }
}

export function toArmyLogView(log) {
  return {
    id: log.id,
    turnNumber: log.turnNumber,
    eventType: log.eventType,
    message: log.message,
    details: log.details,
    createdAt: log.createdAt
  }
}

export function toCampaignTemplateView(template) {
  // Legacy production and reward columns remain database metadata, not public API fields
  return {
    id: template.id,
    campaignNumber: template.campaignNumber,
    campaignName: template.campaignName,
    enemyNation: template.enemyNation,
    description: template.description
  }
}

export function toCampaignTemplateEnemyView(enemy) {
  return {
    sequence: enemy.sequence,
    enemyName: enemy.enemyName,
    fightingStrength: enemy.fightingStrength,
    weakAgainstUnit: enemy.weakAgainstUnit
  }
}

export function buildBattleResponse({
  trigger,
  campaignNumber,
  enemy,
  resolution,
  result
}) {
  // Battle clients get the decision-relevant result without receiving the whole army again
  return {
    trigger,
    outcome: resolution.outcome,
    campaignNumber,
    enemy: {
      name: enemy.enemyName,
      factionName: enemy.factionName,
      fightingStrength: enemy.fightingStrength,
      difficultyMultiplier: enemy.difficultyMultiplier
    },
    player: {
      fightingStrength: resolution.playerStrength.fightingStrength,
      hasCounterUnit: resolution.playerStrength.hasCounterUnit,
      counterMultiplier: resolution.playerStrength.counterMultiplier,
      resourceMultiplier: resolution.playerStrength.resourceMultiplier
    },
    victoryType: resolution.victoryType,
    troopLosses: resolution.troopLosses.map((loss) => ({
      unitName: loss.unitName,
      quantityBefore: loss.quantityBefore,
      quantityLost: loss.quantityLost,
      quantityAfter: loss.quantityAfter
    })),
    armyReset: result.armyReset,
    campaignCompleted: result.campaignCompleted,
    resourceBalances: result.resources,
    campaignProgress: toCampaignProgressSummary(result.progress)
  }
}
