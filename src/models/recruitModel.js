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
  unitTypes
} from '../db/schema.js'

// Recruit model owns all database work needed by the recruit route.
// Reads the one army owned by a user.
export async function findArmyByUserId(userId) {
  const [army] = await db.select().from(armies).where(eq(armies.userId, userId))
  return army
}

// Reads one unit type by name because recruitment only accepts unitName.
export async function findUnitTypeByName(unitName) {
  const [unitType] = await db.select().from(unitTypes).where(eq(unitTypes.unitName, unitName))
  return unitType
}

// Reads the army resource row used for manpower checks.
export async function findResourcesByArmyId(armyId) {
  const [resources] = await db.select().from(armyResources).where(eq(armyResources.armyId, armyId))
  return resources
}

// Reads the central game progress row used for completion gating and log turn numbers.
export async function findCampaignProgressByArmyId(armyId) {
  const [progress] = await db
    .select()
    .from(armyCampaignProgress)
    .where(eq(armyCampaignProgress.armyId, armyId))

  return progress
}

// Reads the army equipment row required for the unit type.
export async function findArmyEquipmentByTypeId(armyId, equipmentTypeId) {
  const [equipment] = await db
    .select()
    .from(armyEquipment)
    .where(and(
      eq(armyEquipment.armyId, armyId),
      eq(armyEquipment.equipmentTypeId, equipmentTypeId)
    ))

  return equipment
}

// Reads the army unit row that will be increased.
export async function findArmyUnitByTypeId(armyId, unitTypeId) {
  const [unit] = await db
    .select()
    .from(armyUnits)
    .where(and(
      eq(armyUnits.armyId, armyId),
      eq(armyUnits.unitTypeId, unitTypeId)
    ))

  return unit
}

// Applies recruitment costs, increases unit quantity, and writes one log row.
export async function recruitUnits({
  army,
  resources,
  equipment,
  armyUnit,
  unitType,
  manpowerCost,
  equipmentCost,
  quantity,
  currentTurn
}) {
  // Recruitment changes resources, equipment, unit quantity, and log together.
  await db.transaction(async (tx) => {
    await tx
      .update(armyResources)
      .set({ manpower: resources.manpower - manpowerCost })
      .where(eq(armyResources.armyId, army.id))

    await tx
      .update(armyEquipment)
      .set({ quantity: equipment.quantity - equipmentCost })
      .where(eq(armyEquipment.id, equipment.id))

    await tx
      .update(armyUnits)
      .set({ quantity: armyUnit.quantity + quantity })
      .where(eq(armyUnits.id, armyUnit.id))

    await tx.insert(armyLogs).values({
      armyId: army.id,
      turnNumber: currentTurn,
      eventType: 'recruit',
      message: `Recruited ${quantity} ${unitType.unitName}.`,
      details: JSON.stringify({
        unitName: unitType.unitName,
        quantity,
        manpowerCost,
        equipmentCost
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

// Builds the updated army state after recruitment.
export async function findArmyStateByUserId(userId) {
  // Return the updated state after recruitment succeeds.
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
