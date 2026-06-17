import { and, eq } from 'drizzle-orm'
import { getObjectValueOrDefault } from '../../helper.js'
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
import {
  BATTLE_LOW_RESOURCE_MORALE_PENALTY,
  BATTLE_VICTORY_MORALE_GAIN,
  ENEMIES_PER_CAMPAIGN,
  FINAL_CAMPAIGN_NUMBER,
  FIRST_CAMPAIGN_NUMBER,
  STARTING_EQUIPMENT,
  STARTING_RESOURCES,
  STARTING_UNITS
} from '../constants/gameBalance.js'
import { clampMorale } from '../utils/turnCalculator.js'

// Battle model owns battle-specific reads and the battle transaction.
// Reads one user before battle actions.
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

// Reads the one army owned by a user.
export async function findArmyByUserId(userId) {
  const [army] = await db.select().from(armies).where(eq(armies.userId, userId))
  return army
}

// Reads the one campaign progress row for an army.
export async function findCampaignProgressByArmyId(armyId, client = db) {
  const [progress] = await client
    .select()
    .from(armyCampaignProgress)
    .where(eq(armyCampaignProgress.armyId, armyId))

  return progress
}

// Reads the campaign row used for progression and major rewards.
export async function findCampaignById(campaignId, client = db) {
  const [campaign] = await client
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  return campaign
}

// Reads a campaign by number for first-campaign reset and next-campaign progress.
async function findCampaignByNumber(campaignNumber, client = db) {
  const [campaign] = await client
    .select()
    .from(campaigns)
    .where(eq(campaigns.campaignNumber, campaignNumber))

  return campaign
}

// Reads the enemy selected by the current campaign progress.
export async function findEnemyByCampaignAndSequence(campaignId, sequence, client = db) {
  const [enemy] = await client
    .select()
    .from(campaignEnemyArmies)
    .where(and(
      eq(campaignEnemyArmies.campaignId, campaignId),
      eq(campaignEnemyArmies.sequence, sequence)
    ))

  return enemy
}

// Reads army resources before battle calculations.
export async function findResourcesByArmyId(armyId) {
  const [resources] = await db.select().from(armyResources).where(eq(armyResources.armyId, armyId))
  return resources
}

// Reads unit quantities and strengths before battle calculations.
export async function findArmyUnitsWithTypes(armyId, client = db) {
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

// Reads equipment quantities with equipment names for state output and reset work.
async function findArmyEquipmentWithTypes(armyId, client = db) {
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

// Reads the one linear campaign progress row with its current enemy.
export async function findCampaignProgressDetailsByArmyId(armyId, client = db) {
  const [progress] = await client
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

// Builds the updated army state after battle.
export async function findArmyStateByUserId(userId) {
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

// Resets resources, equipment, units, day, and campaign progress after defeat.
async function resetArmyToFirstCampaign(tx, army, enemy, battleDetails) {
  const firstCampaign = await findCampaignByNumber(FIRST_CAMPAIGN_NUMBER, tx)

  if (!firstCampaign) {
    throw new Error('First campaign is missing from the database.')
  }

  await tx
    .update(armies)
    .set({ currentDay: 1, status: 'active', updatedAt: new Date() })
    .where(eq(armies.id, army.id))

  await tx
    .update(armyResources)
    .set(STARTING_RESOURCES)
    .where(eq(armyResources.armyId, army.id))

  const equipmentRows = await findArmyEquipmentWithTypes(army.id, tx)

  for (const equipment of equipmentRows) {
    await tx
      .update(armyEquipment)
      .set({
        quantity: getObjectValueOrDefault(STARTING_EQUIPMENT, equipment.equipmentName, 0)
      })
      .where(eq(armyEquipment.id, equipment.id))
  }

  const unitRows = await findArmyUnitsWithTypes(army.id, tx)

  for (const unit of unitRows) {
    await tx
      .update(armyUnits)
      .set({
        quantity: getObjectValueOrDefault(STARTING_UNITS, unit.unitName, 0)
      })
      .where(eq(armyUnits.id, unit.armyUnitId))
  }

  const [progress] = await tx
    .update(armyCampaignProgress)
    .set({
      campaignId: firstCampaign.id,
      currentEnemySequence: 1,
      updatedAt: new Date()
    })
    .where(eq(armyCampaignProgress.armyId, army.id))
    .returning()

  await tx.insert(armyLogs).values({
    armyId: army.id,
    dayNumber: army.currentDay,
    eventType: 'battle',
    message: `Defeated by ${enemy.enemyName}. Army reset to ${firstCampaign.campaignName}.`,
    details: JSON.stringify(battleDetails)
  })

  return progress
}

// Applies victory rewards and moves the user to the next enemy or campaign.
async function applyVictoryProgress(tx, army, campaign, progress, enemy, resources, battleCost, battleDetails) {
  let moraleChange = BATTLE_VICTORY_MORALE_GAIN

  if (!battleDetails.hasEnoughFlour || !battleDetails.hasEnoughSupply) {
    moraleChange = moraleChange + BATTLE_LOW_RESOURCE_MORALE_PENALTY
  }

  const resourceChanges = {
    manpower: resources.manpower + enemy.minorRewardManpower,
    ducats: resources.ducats + enemy.minorRewardDucats,
    flour: Math.max(0, resources.flour - battleCost.flour),
    supply: Math.max(0, resources.supply - battleCost.supply) + enemy.minorRewardSupply,
    morale: clampMorale(resources.morale + moraleChange)
  }

  let campaignCompleted = false
  let gameCompleted = false
  let nextCampaign = null

  if (progress.currentEnemySequence >= ENEMIES_PER_CAMPAIGN) {
    campaignCompleted = true
    resourceChanges.manpower = resourceChanges.manpower + campaign.majorRewardManpower
    resourceChanges.ducats = resourceChanges.ducats + campaign.majorRewardDucats
    resourceChanges.supply = resourceChanges.supply + campaign.majorRewardSupply
    resourceChanges.morale = clampMorale(resourceChanges.morale + campaign.majorRewardMorale)

    if (campaign.campaignNumber >= FINAL_CAMPAIGN_NUMBER) {
      gameCompleted = true
    } else {
      nextCampaign = await findCampaignByNumber(campaign.campaignNumber + 1, tx)

      if (!nextCampaign) {
        throw new Error('Next campaign is missing from the database.')
      }
    }
  }

  await tx
    .update(armyResources)
    .set(resourceChanges)
    .where(eq(armyResources.armyId, army.id))

  let progressAfterBattle = progress

  if (gameCompleted) {
    await tx
      .update(armies)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(armies.id, army.id))
  } else if (campaignCompleted) {
    const [advancedProgress] = await tx
      .update(armyCampaignProgress)
      .set({
        campaignId: nextCampaign.id,
        currentEnemySequence: 1,
        updatedAt: new Date()
      })
      .where(eq(armyCampaignProgress.id, progress.id))
      .returning()

    progressAfterBattle = advancedProgress
  } else {
    const [advancedProgress] = await tx
      .update(armyCampaignProgress)
      .set({
        currentEnemySequence: progress.currentEnemySequence + 1,
        updatedAt: new Date()
      })
      .where(eq(armyCampaignProgress.id, progress.id))
      .returning()

    progressAfterBattle = advancedProgress
  }

  await tx.insert(armyLogs).values({
    armyId: army.id,
    dayNumber: army.currentDay,
    eventType: 'battle',
    message: `Defeated ${enemy.enemyName}.`,
    details: JSON.stringify(battleDetails)
  })

  if (campaignCompleted) {
    let campaignMessage = `${campaign.campaignName} completed.`

    if (gameCompleted) {
      campaignMessage = 'Final campaign completed. Leviathan is victorious.'
    }

    await tx.insert(armyLogs).values({
      armyId: army.id,
      dayNumber: army.currentDay,
      eventType: 'campaign',
      message: campaignMessage,
      details: JSON.stringify({
        completedCampaign: campaign.campaignName,
        majorRewardDucats: campaign.majorRewardDucats,
        majorRewardManpower: campaign.majorRewardManpower,
        majorRewardSupply: campaign.majorRewardSupply,
        majorRewardMorale: campaign.majorRewardMorale
      })
    })
  }

  return {
    progress: progressAfterBattle,
    campaignCompleted,
    gameCompleted,
    resourceChanges
  }
}

// Applies the battle result in one transaction.
export async function resolveBattle({
  army,
  campaign,
  progress,
  enemy,
  resources,
  battleCost,
  battleDetails,
  outcome
}) {
  // Victory advances linear progress. Defeat resets the army to campaign one.
  return await db.transaction(async (tx) => {
    if (outcome === 'defeat') {
      const progressAfterReset = await resetArmyToFirstCampaign(tx, army, enemy, battleDetails)

      return {
        progress: progressAfterReset,
        campaignCompleted: false,
        gameCompleted: false,
        armyReset: true
      }
    }

    const victoryResult = await applyVictoryProgress(
      tx,
      army,
      campaign,
      progress,
      enemy,
      resources,
      battleCost,
      battleDetails
    )

    return {
      ...victoryResult,
      armyReset: false
    }
  })
}
