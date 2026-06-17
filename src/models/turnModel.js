import { and, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
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
  unitTypes,
  users
} from '../db/schema.js'

// Turn model owns the database changes for advancing one army day.
// Reads one user before turn advancement.
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

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

// Applies all turn changes and writes one army_log row.
export async function advanceTurn({ army, turnResult, equipmentGain, equipmentRows }) {
  // A turn updates army day, resources, equipment, and log together.
  await db.transaction(async (tx) => {
    await tx
      .update(armies)
      .set({ currentDay: army.currentDay + 1, updatedAt: new Date() })
      .where(eq(armies.id, army.id))

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

    await tx.insert(armyLogs).values({
      armyId: army.id,
      dayNumber: turnResult.dayNumber,
      eventType: 'turn',
      message: `Advanced to day ${turnResult.dayNumber}.`,
      details: JSON.stringify({
        manpowerGained: turnResult.manpowerGained,
        equipmentGained: equipmentGain,
        flourConsumed: turnResult.flourConsumed,
        supplyConsumed: turnResult.supplyConsumed,
        moraleChange: turnResult.moraleChange
      })
    })
  })
}

// Reads the one linear campaign progress row with its current enemy.
async function findCampaignProgressDetailsByArmyId(armyId) {
  const [progress] = await db
    .select({
      id: armyCampaignProgress.id,
      armyId: armyCampaignProgress.armyId,
      campaignId: armyCampaignProgress.campaignId,
      currentEnemySequence: armyCampaignProgress.currentEnemySequence,
      campaignNumber: campaigns.campaignNumber,
      campaignName: campaigns.campaignName,
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
