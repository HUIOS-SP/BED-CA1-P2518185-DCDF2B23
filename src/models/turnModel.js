import { and, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import {
  ENEMY_ATTACK_AT_TURN
} from '../constants/gameBalance.js'
import * as battleModel from './battleModel.js'
import {
  armies,
  armyCampaignProgress,
  armyEquipment,
  armyLogs,
  armyResources,
  armyUnits,
  campaignEnemyArmies,
  campaigns,
  equipmentTypes,
  unitTypes
} from '../db/schema.js'

// Turn model owns the database changes for advancing one game turn.
// Reads the one army owned by a user.
export async function findArmyByUserId(userId) {
  const [army] = await db.select().from(armies).where(eq(armies.userId, userId))
  return army
}

// Reads resources used by the turn calculation.
export async function findResourcesByArmyId(armyId) {
  const [resources] = await db.select().from(armyResources).where(eq(armyResources.armyId, armyId))
  return resources
}

// Reads equipment quantities before applying equipment gains.
export async function findArmyEquipmentWithTypes(armyId) {
  return await db
    .select({
      id: armyEquipment.id,
      armyId: armyEquipment.armyId,
      equipmentTypeId: armyEquipment.equipmentTypeId,
      equipmentName: equipmentTypes.equipmentName,
      quantity: armyEquipment.quantity
    })
    .from(armyEquipment)
    .innerJoin(equipmentTypes, eq(armyEquipment.equipmentTypeId, equipmentTypes.id))
    .where(eq(armyEquipment.armyId, armyId))
}

// Reads units and upkeep rules before calculating turn cost.
export async function findArmyUnitsWithTypes(armyId) {
  return await db
    .select({
      armyUnitId: armyUnits.id,
      armyId: armyUnits.armyId,
      unitTypeId: armyUnits.unitTypeId,
      unitName: unitTypes.unitName,
      quantity: armyUnits.quantity,
      baseStrength: unitTypes.baseStrength,
      requiredManpower: unitTypes.requiredManpower,
      requiredEquipmentTypeId: unitTypes.requiredEquipmentTypeId,
      requiredEquipmentQty: unitTypes.requiredEquipmentQty,
      flourUpkeep: unitTypes.flourUpkeep,
      supplyUpkeep: unitTypes.supplyUpkeep,
      battleSupplyCost: unitTypes.battleSupplyCost
    })
    .from(armyUnits)
    .innerJoin(unitTypes, eq(armyUnits.unitTypeId, unitTypes.id))
    .where(eq(armyUnits.armyId, armyId))
}

// Reads all equipment types so each type can gain quantity.
export async function findAllEquipmentTypes() {
  return await db.select().from(equipmentTypes)
}

// Reads the one campaign progress row for turn-limit checks.
export async function findCampaignProgressByArmyId(armyId) {
  const [progress] = await db
    .select()
    .from(armyCampaignProgress)
    .where(eq(armyCampaignProgress.armyId, armyId))

  return progress
}

// Reads the campaign row needed when auto-attack must resolve a battle.
export async function findCampaignById(campaignId) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  return campaign
}

// Reads the exact current enemy from campaign progress.
export async function findEnemyByCampaignAndSequence(campaignId, sequence) {
  const [enemy] = await db
    .select()
    .from(campaignEnemyArmies)
    .where(and(
      eq(campaignEnemyArmies.campaignId, campaignId),
      eq(campaignEnemyArmies.sequence, sequence)
    ))

  return enemy
}

// Applies all turn changes and optionally resolves an enemy auto-attack.
export async function advanceTurn({
  army,
  progress,
  turnResult,
  equipmentGain,
  equipmentRows,
  turnsOnCurrentEnemy,
  enemyAttackAtTurn = ENEMY_ATTACK_AT_TURN,
  enemyAttacked,
  campaign,
  enemy,
  battleResolution
}) {
  // A turn updates progress, resources, equipment, and its log together.
  return await db.transaction(async (tx) => {
    await tx
      .update(armyResources)
      .set(turnResult.resources)
      .where(eq(armyResources.armyId, army.id))

    for (const gain of equipmentGain) {
      const equipment = equipmentRows.find((row) => row.equipmentTypeId === gain.equipmentTypeId)

      await tx
        .update(armyEquipment)
        .set({ quantity: equipment.quantity + gain.quantity })
        .where(eq(armyEquipment.id, equipment.id))
    }

    await tx
      .update(armyCampaignProgress)
      .set({
        currentTurn: turnResult.turnNumber,
        turnsOnCurrentEnemy,
        updatedAt: new Date()
      })
      .where(eq(armyCampaignProgress.id, progress.id))

    await tx.insert(armyLogs).values({
      armyId: army.id,
      turnNumber: turnResult.turnNumber,
      eventType: 'turn',
      message: `Advanced to turn ${turnResult.turnNumber}.`,
      details: JSON.stringify({
        manpowerGained: turnResult.manpowerGained,
        equipmentGained: equipmentGain,
        flourGained: turnResult.flourGained,
        supplyGained: turnResult.supplyGained,
        flourConsumed: turnResult.flourConsumed,
        supplyConsumed: turnResult.supplyConsumed,
        moraleChange: turnResult.moraleChange,
        turnsOnCurrentEnemy,
        enemyAttackAtTurn,
        enemyAttacked,
        triggeredEnemyName: enemyAttacked ? enemy.enemyName : null
      })
    })

    if (!enemyAttacked) {
      return {
        enemyAttacked: false,
        battleResult: null
      }
    }

    const battleResult = await battleModel.applyBattleResultInTransaction(tx, {
      army,
      campaign,
      progress: {
        ...progress,
        currentTurn: turnResult.turnNumber,
        turnsOnCurrentEnemy
      },
      enemy,
      resources: turnResult.resources,
      battleCost: battleResolution.battleCost,
      battleDetails: battleResolution.battleDetails,
      troopLosses: battleResolution.troopLosses,
      outcome: battleResolution.outcome,
      battleTurnNumber: turnResult.turnNumber
    })

    return {
      enemyAttacked: true,
      battleResult
    }
  })
}

// Reads the one linear campaign progress row with its current enemy.
async function findCampaignProgressDetailsByArmyId(armyId) {
  const [progress] = await db
    .select({
      id: armyCampaignProgress.id,
      armyId: armyCampaignProgress.armyId,
      campaignId: armyCampaignProgress.campaignId,
      currentTurn: armyCampaignProgress.currentTurn,
      currentEnemySequence: armyCampaignProgress.currentEnemySequence,
      turnsOnCurrentEnemy: armyCampaignProgress.turnsOnCurrentEnemy,
      gameCompleted: armyCampaignProgress.gameCompleted,
      campaignNumber: campaigns.campaignNumber,
      campaignName: campaigns.campaignName,
      manpowerGainPerTurn: campaigns.manpowerGainPerTurn,
      musketsGainPerTurn: campaigns.musketsGainPerTurn,
      horsesGainPerTurn: campaigns.horsesGainPerTurn,
      fieldGunsGainPerTurn: campaigns.fieldGunsGainPerTurn,
      flourGainPerTurn: campaigns.flourGainPerTurn,
      supplyGainPerTurn: campaigns.supplyGainPerTurn,
      enemyNation: campaigns.enemyNation,
      enemyName: campaignEnemyArmies.enemyName,
      enemyFightingStrength: campaignEnemyArmies.fightingStrength,
      weakAgainstUnit: campaignEnemyArmies.weakAgainstUnit
    })
    .from(armyCampaignProgress)
    .innerJoin(campaigns, eq(armyCampaignProgress.campaignId, campaigns.id))
    .innerJoin(campaignEnemyArmies, and(
      eq(campaignEnemyArmies.campaignId, armyCampaignProgress.campaignId),
      eq(campaignEnemyArmies.sequence, armyCampaignProgress.currentEnemySequence)
    ))
    .where(eq(armyCampaignProgress.armyId, armyId))

  return progress
}

// Builds the updated army state after turn advancement.
export async function findArmyStateByUserId(userId) {
  // Return the updated state after turn advancement succeeds.
  const army = await findArmyByUserId(userId)

  if (!army) {
    return undefined
  }

  const [resources, equipment, units, campaignProgress] = await Promise.all([
    findResourcesByArmyId(army.id),
    findArmyEquipmentWithTypes(army.id),
    findArmyUnitsWithTypes(army.id),
    findCampaignProgressDetailsByArmyId(army.id)
  ])

  return {
    army,
    resources,
    equipment,
    units,
    campaignProgress
  }
}
