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

// Trade model owns resource updates and army_log creation.
// Reads one user before trading.
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

// Reads the one army owned by a user.
export async function findArmyByUserId(userId) {
  const [army] = await db.select().from(armies).where(eq(armies.userId, userId))
  return army
}

// Reads resources so the controller can check affordability.
export async function findResourcesByArmyId(armyId) {
  const [resources] = await db.select().from(armyResources).where(eq(armyResources.armyId, armyId))
  return resources
}

// Applies the resource change and writes one generic log row.
export async function tradeResources(army, resourceChanges, tradeData) {
  // Trade changes resources and writes a log in the same transaction.
  await db.transaction(async (tx) => {
    await tx
      .update(armyResources)
      .set(resourceChanges)
      .where(eq(armyResources.armyId, army.id))

    let message = `Bought ${tradeData.quantity} ${tradeData.item}.`

    if (tradeData.tradeType === 'sell') {
      message = `Sold ${tradeData.quantity} ${tradeData.item}.`
    }

    await tx.insert(armyLogs).values({
      armyId: army.id,
      dayNumber: army.currentDay,
      eventType: 'trade',
      message,
      details: JSON.stringify(tradeData)
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

// Builds the updated army state after trading.
export async function findArmyStateByUserId(userId) {
  // Return the updated state after a successful trade.
  const army = await findArmyByUserId(userId)

  if (!army) {
    return undefined
  }

  const [resources, equipment, units, campaignProgress] = await Promise.all([
    findResourcesByArmyId(army.id),
    db
      .select({
        id: armyEquipment.id,
        armyId: armyEquipment.armyId,
        equipmentTypeId: armyEquipment.equipmentTypeId,
        equipmentName: equipmentTypes.equipmentName,
        quantity: armyEquipment.quantity
      })
      .from(armyEquipment)
      .innerJoin(equipmentTypes, eq(armyEquipment.equipmentTypeId, equipmentTypes.id))
      .where(eq(armyEquipment.armyId, army.id)),
    db
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
      .where(eq(armyUnits.armyId, army.id)),
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
