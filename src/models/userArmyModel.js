import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import {
  armies, armyCampaignProgress, armyEquipment, armyLogs,
  armyResources, armyUnits, unitTypes
} from '../db/schema.js'
import { STARTING_EQUIPMENT, STARTING_RESOURCES, STARTING_UNITS } from '../constants/gameBalance.js'
import { generateCurrentEnemy, getRandomFactionKey } from '../utils/enemyGenerator.js'
import { getObjectValueOrDefault } from '../utils/helper.js'

const MISSING_CAMPAIGN_PROGRESS_ERROR = 'Army has no campaign progress.'
export const INCOMPLETE_ARMY_STATE_ERROR =
  'Army state is incomplete. Restart the game to restore required state.'

// Converts missing database pieces into one clear gameplay conflict message
export function getArmyStateError(gameState) {
  if (gameState.missingParts.includes('campaignProgress')) {
    return MISSING_CAMPAIGN_PROGRESS_ERROR
  }

  if (gameState.missingParts.length > 0) {
    return INCOMPLETE_ARMY_STATE_ERROR
  }

  return null
}

// Reads the one army owned by a user
export async function findArmyByUserId(userId, client = db) {
  const [army] = await client.select().from(armies).where(eq(armies.userId, userId))
  return army
}

async function findResourcesByArmyId(armyId, client = db) {
  const [resources] = await client.select().from(armyResources).where(eq(armyResources.armyId, armyId))
  return resources
}

async function findArmyEquipmentByArmyId(armyId, client = db) {
  const [equipment] = await client.select().from(armyEquipment).where(eq(armyEquipment.armyId, armyId))
  return equipment
}

// Joins quantities with unit rules so controllers do not need to assemble them manually
export async function findArmyUnitsWithTypes(armyId, client = db) {
  return client.select({
    armyUnitId: armyUnits.id,
    armyId: armyUnits.armyId,
    unitTypeId: armyUnits.unitTypeId,
    unitName: unitTypes.unitName,
    quantity: armyUnits.quantity,
    baseStrength: unitTypes.baseStrength,
    requiredManpower: unitTypes.requiredManpower,
    requiredEquipment: unitTypes.requiredEquipment,
    requiredEquipmentQty: unitTypes.requiredEquipmentQty,
    flourUpkeep: unitTypes.flourUpkeep,
    supplyUpkeep: unitTypes.supplyUpkeep,
    battleSupplyCost: unitTypes.battleSupplyCost
  }).from(armyUnits)
    .innerJoin(unitTypes, eq(armyUnits.unitTypeId, unitTypes.id))
    .where(eq(armyUnits.armyId, armyId))
}

async function findCampaignProgressByArmyId(armyId, client = db) {
  const [progress] = await client.select().from(armyCampaignProgress)
    .where(eq(armyCampaignProgress.armyId, armyId))
  return progress
}

// Adds the generated enemy to stored progress without pretending an enemy row exists
function buildCampaignProgressDetails(progress) {
  const currentEnemy = generateCurrentEnemy({
    campaignNumber: progress.campaignNumber,
    enemySequence: progress.currentEnemySequence,
    factionKey: progress.currentFaction
  })

  return {
    ...progress,
    currentEnemy
  }
}

// Loads the reusable gameplay snapshot and reports exactly which required pieces are missing
export async function findArmyGameplayStateByArmyId(armyId, client = db) {
  // Independent reads run together; less waiting, same clear result
  const [resources, equipment, units, progress, catalogUnitTypes] = await Promise.all([
    findResourcesByArmyId(armyId, client),
    findArmyEquipmentByArmyId(armyId, client),
    findArmyUnitsWithTypes(armyId, client),
    findCampaignProgressByArmyId(armyId, client),
    client.select({ id: unitTypes.id }).from(unitTypes)
  ])
  // Every seeded unit type should have one owned quantity row, even when quantity is zero
  const ownedUnitTypeIds = new Set(units.map((unit) => unit.unitTypeId))
  const missingParts = []

  if (!resources) missingParts.push('resources')
  if (!equipment) missingParts.push('equipment')
  if (!progress) missingParts.push('campaignProgress')
  if (
    catalogUnitTypes.length === 0 ||
    catalogUnitTypes.some((unitType) => !ownedUnitTypeIds.has(unitType.id))
  ) {
    missingParts.push('units')
  }

  return { resources, equipment, units, progress, missingParts }
}

export async function findArmyStateStatusByArmy(army, client = db) {
  // Full-state reads add presentation details; mutation controllers use the leaner snapshot above
  const gameState = await findArmyGameplayStateByArmyId(army.id, client)
  return {
    state: {
      army,
      resources: gameState.resources,
      equipment: gameState.equipment,
      units: gameState.units,
      campaignProgress: gameState.progress
        ? buildCampaignProgressDetails(gameState.progress)
        : undefined
    },
    missingParts: gameState.missingParts
  }
}

// Creates every starter row using the caller's user-creation transaction
export async function createArmyForUserInTransaction(client, userId, armyName) {
  const allUnitTypes = await client.select().from(unitTypes)
  if (allUnitTypes.length === 0) throw new Error('Unit types must be seeded before creating an army.')

  const [army] = await client.insert(armies).values({ userId, armyName }).returning()
  await client.insert(armyResources).values({ armyId: army.id, ...STARTING_RESOURCES })
  await client.insert(armyEquipment).values({ armyId: army.id, ...STARTING_EQUIPMENT })
  await client.insert(armyUnits).values(allUnitTypes.map((unitType) => ({
    armyId: army.id,
    unitTypeId: unitType.id,
    quantity: getObjectValueOrDefault(STARTING_UNITS, unitType.unitName, 0)
  })))

  // Roll once, persist once: reading state later will not randomly switch factions
  const currentFaction = getRandomFactionKey()
  await client.insert(armyCampaignProgress).values({
    armyId: army.id,
    campaignNumber: 1,
    currentTurn: 1,
    currentEnemySequence: 1,
    currentFaction,
    campaignsCompleted: 0,
    turnsOnCurrentEnemy: 0
  })
  await client.insert(armyLogs).values({
    armyId: army.id,
    turnNumber: 1,
    eventType: 'campaign_started',
    message: `Campaign 1 started against ${generateCurrentEnemy({ campaignNumber: 1, enemySequence: 1, factionKey: currentFaction }).factionName}.`
  })
  return army
}

// Restores starter gameplay state while preserving the existing user and army identity
export async function restartGameForArmy(army) {
  return db.transaction(async (tx) => {
    const allUnitTypes = await tx.select().from(unitTypes)
    if (allUnitTypes.length === 0) {
      throw new Error('Unit types must be seeded before restarting an army.')
    }
    const currentFaction = getRandomFactionKey()

    const [updatedArmy] = await tx.update(armies)
      .set({ updatedAt: new Date() })
      .where(eq(armies.id, army.id))
      .returning()
    // Restart also repairs missing singleton rows, which makes it the recovery path
    const resources = await findResourcesByArmyId(army.id, tx)
    if (resources) await tx.update(armyResources).set(STARTING_RESOURCES).where(eq(armyResources.armyId, army.id))
    else await tx.insert(armyResources).values({ armyId: army.id, ...STARTING_RESOURCES })

    const equipment = await findArmyEquipmentByArmyId(army.id, tx)
    if (equipment) await tx.update(armyEquipment).set(STARTING_EQUIPMENT).where(eq(armyEquipment.armyId, army.id))
    else await tx.insert(armyEquipment).values({ armyId: army.id, ...STARTING_EQUIPMENT })

    // Update existing unit rows and recreate any missing catalogue entries
    const existingUnits = await tx.select().from(armyUnits).where(eq(armyUnits.armyId, army.id))
    for (const unitType of allUnitTypes) {
      const row = existingUnits.find((unit) => unit.unitTypeId === unitType.id)
      const quantity = getObjectValueOrDefault(STARTING_UNITS, unitType.unitName, 0)
      if (row) await tx.update(armyUnits).set({ quantity }).where(eq(armyUnits.id, row.id))
      else await tx.insert(armyUnits).values({ armyId: army.id, unitTypeId: unitType.id, quantity })
    }

    const [progress] = await tx.select().from(armyCampaignProgress).where(eq(armyCampaignProgress.armyId, army.id))
    const progressValues = {
      campaignNumber: 1, currentTurn: 1, currentEnemySequence: 1,
      currentFaction, campaignsCompleted: 0, turnsOnCurrentEnemy: 0, updatedAt: new Date()
    }
    const [restartedProgress] = progress
      ? await tx.update(armyCampaignProgress)
        .set(progressValues)
        .where(eq(armyCampaignProgress.id, progress.id))
        .returning()
      : await tx.insert(armyCampaignProgress)
        .values({ armyId: army.id, ...progressValues })
        .returning()

    // A restart begins a fresh journal chapter instead of carrying old battle noise forward
    await tx.delete(armyLogs).where(eq(armyLogs.armyId, army.id))
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: 1, eventType: 'army_restarted',
      message: 'Army restarted. Campaign 1 begins from enemy 1.'
    })
    return {
      armyId: updatedArmy.id,
      campaignNumber: restartedProgress.campaignNumber,
      currentTurn: restartedProgress.currentTurn,
      currentEnemySequence: restartedProgress.currentEnemySequence,
      currentFaction: restartedProgress.currentFaction,
      campaignsCompleted: restartedProgress.campaignsCompleted,
      turnsOnCurrentEnemy: restartedProgress.turnsOnCurrentEnemy
    }
  })
}

export async function updateArmyNameByUserId(userId, armyName) {
  const [army] = await db.update(armies).set({ armyName, updatedAt: new Date() })
    .where(eq(armies.userId, userId)).returning()
  return army
}
