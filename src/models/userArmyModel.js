import { and, eq } from 'drizzle-orm'
import { getObjectValueOrDefault } from '../utils/helper.js'
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
import {
  FIRST_CAMPAIGN_NUMBER,
  STARTING_EQUIPMENT,
  STARTING_RESOURCES,
  STARTING_UNITS
} from '../constants/gameBalance.js'
import { resetTurnsOnCurrentEnemy } from '../utils/turnCalculator.js'

// User army model owns the user's required army and full state reads.
// Reads the one army owned by a user.
export async function findArmyByUserId(userId, client = db) {
  const [army] = await client.select().from(armies).where(eq(armies.userId, userId))
  return army
}

// Reads the resource row that belongs to an army.
export async function findResourcesByArmyId(armyId, client = db) {
  const [resources] = await client
    .select()
    .from(armyResources)
    .where(eq(armyResources.armyId, armyId))

  return resources
}

// Reads equipment quantities with equipment names.
export async function findArmyEquipmentWithTypes(armyId, client = db) {
  // Join equipment quantities with their catalog names for readable API output.
  return await client
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

// Reads unit quantities with unit type rules.
export async function findArmyUnitsWithTypes(armyId, client = db) {
  // Join army unit quantities with unit type rules for readable state output.
  return await client
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

// Reads the one linear campaign progress row with its current enemy.
export async function findCampaignProgressDetailsByArmyId(armyId, client = db) {
  const [progress] = await client
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

// Builds the complete state for an army row that has already been loaded.
export async function findArmyStateByArmy(army) {
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

// Loads an army by user id before building the same complete state.
// Other feature models use this wrapper after actions change the database.
export async function findArmyStateByUserId(userId) {
  const army = await findArmyByUserId(userId)

  if (!army) {
    return undefined
  }

  return await findArmyStateByArmy(army)
}

// Reads the first campaign so new armies can start Unix Wars automatically.
async function findFirstCampaign(client) {
  const [campaign] = await client
    .select()
    .from(campaigns)
    .where(eq(campaigns.campaignNumber, FIRST_CAMPAIGN_NUMBER))

  return campaign
}

// Creates the army and all starting rows inside an existing transaction.
export async function createArmyForUserInTransaction(client, userId, armyName) {
  const allEquipmentTypes = await client.select().from(equipmentTypes)
  const allUnitTypes = await client.select().from(unitTypes)
  const firstCampaign = await findFirstCampaign(client)

  if (allEquipmentTypes.length === 0 || allUnitTypes.length === 0 || !firstCampaign) {
    throw new Error('Game catalogs must be seeded before creating an army.')
  }

  const [army] = await client.insert(armies).values({
    userId,
    armyName
  }).returning()

  await client.insert(armyResources).values({
    armyId: army.id,
    ...STARTING_RESOURCES
  })

  await client.insert(armyEquipment).values(allEquipmentTypes.map((equipmentType) => ({
    armyId: army.id,
    equipmentTypeId: equipmentType.id,
    quantity: getObjectValueOrDefault(STARTING_EQUIPMENT, equipmentType.equipmentName, 0)
  })))

  await client.insert(armyUnits).values(allUnitTypes.map((unitType) => ({
    armyId: army.id,
    unitTypeId: unitType.id,
    quantity: getObjectValueOrDefault(STARTING_UNITS, unitType.unitName, 0)
  })))

  await client.insert(armyCampaignProgress).values({
    armyId: army.id,
    campaignId: firstCampaign.id,
    currentTurn: 1,
    currentEnemySequence: 1,
    turnsOnCurrentEnemy: resetTurnsOnCurrentEnemy(),
    gameCompleted: false
  })

  await client.insert(armyLogs).values({
    armyId: army.id,
    turnNumber: 1,
    eventType: 'campaign',
    message: `${firstCampaign.campaignName} started automatically.`
  })

  return army
}

// Resets the user's army to the default starting game state.
export async function restartGameForArmy(army) {
  return await db.transaction(async (tx) => {
    const allEquipmentTypes = await tx.select().from(equipmentTypes)
    const allUnitTypes = await tx.select().from(unitTypes)
    const firstCampaign = await findFirstCampaign(tx)

    if (allEquipmentTypes.length === 0 || allUnitTypes.length === 0 || !firstCampaign) {
      throw new Error('Game catalogs must be seeded before restarting an army.')
    }

    await tx
      .update(armies)
      .set({
        updatedAt: new Date()
      })
      .where(eq(armies.id, army.id))

    const resources = await findResourcesByArmyId(army.id, tx)

    if (resources) {
      await tx
        .update(armyResources)
        .set(STARTING_RESOURCES)
        .where(eq(armyResources.id, resources.id))
    } else {
      await tx.insert(armyResources).values({
        armyId: army.id,
        ...STARTING_RESOURCES
      })
    }

    const equipmentRows = await tx
      .select()
      .from(armyEquipment)
      .where(eq(armyEquipment.armyId, army.id))

    for (const equipmentType of allEquipmentTypes) {
      const existingEquipment = equipmentRows.find((row) => row.equipmentTypeId === equipmentType.id)
      const startingQuantity = getObjectValueOrDefault(
        STARTING_EQUIPMENT,
        equipmentType.equipmentName,
        0
      )

      if (existingEquipment) {
        await tx
          .update(armyEquipment)
          .set({ quantity: startingQuantity })
          .where(eq(armyEquipment.id, existingEquipment.id))
      } else {
        await tx.insert(armyEquipment).values({
          armyId: army.id,
          equipmentTypeId: equipmentType.id,
          quantity: startingQuantity
        })
      }
    }

    const unitRows = await tx
      .select()
      .from(armyUnits)
      .where(eq(armyUnits.armyId, army.id))

    for (const unitType of allUnitTypes) {
      const existingUnit = unitRows.find((row) => row.unitTypeId === unitType.id)
      const startingQuantity = getObjectValueOrDefault(STARTING_UNITS, unitType.unitName, 0)

      if (existingUnit) {
        await tx
          .update(armyUnits)
          .set({ quantity: startingQuantity })
          .where(eq(armyUnits.id, existingUnit.id))
      } else {
        await tx.insert(armyUnits).values({
          armyId: army.id,
          unitTypeId: unitType.id,
          quantity: startingQuantity
        })
      }
    }

    const [progress] = await tx
      .select()
      .from(armyCampaignProgress)
      .where(eq(armyCampaignProgress.armyId, army.id))

    if (progress) {
      await tx
        .update(armyCampaignProgress)
        .set({
          campaignId: firstCampaign.id,
          currentTurn: 1,
          currentEnemySequence: 1,
          turnsOnCurrentEnemy: resetTurnsOnCurrentEnemy(),
          gameCompleted: false,
          updatedAt: new Date()
        })
        .where(eq(armyCampaignProgress.id, progress.id))
    } else {
      await tx.insert(armyCampaignProgress).values({
        armyId: army.id,
        campaignId: firstCampaign.id,
        currentTurn: 1,
        currentEnemySequence: 1,
        turnsOnCurrentEnemy: resetTurnsOnCurrentEnemy(),
        gameCompleted: false
      })
    }

    await tx.delete(armyLogs).where(eq(armyLogs.armyId, army.id))

    await tx.insert(armyLogs).values({
      armyId: army.id,
      turnNumber: 1,
      eventType: 'campaign',
      message: `Game restarted. ${firstCampaign.campaignName} started from enemy sequence 1.`
    })

    const [restartedArmy] = await tx.select().from(armies).where(eq(armies.id, army.id))

    return restartedArmy
  })
}

// Updates the army_name field for a user's army.
export async function updateArmyNameByUserId(userId, armyName) {
  const [army] = await db
    .update(armies)
    .set({ armyName, updatedAt: new Date() })
    .where(eq(armies.userId, userId))
    .returning()

  return army
}
