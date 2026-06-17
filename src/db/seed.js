import { and, eq } from 'drizzle-orm'
import { db } from './db.js'
import {
  campaignEnemyArmies,
  campaigns,
  equipmentTypes,
  unitTypes
} from './schema.js'
import {
  CAMPAIGNS,
  EQUIPMENT_TYPES,
  UNIT_TYPES,
  VALID_WEAKNESSES
} from '../constants/gameBalance.js'

// Seed helpers check for existing rows so npm run db can be repeated safely.
// Finds one equipment type by its unique name.
async function findEquipmentByName(equipmentName) {
  const [equipment] = await db
    .select()
    .from(equipmentTypes)
    .where(eq(equipmentTypes.equipmentName, equipmentName))

  return equipment
}

// Finds one unit type by its unique name.
async function findUnitByName(unitName) {
  const [unit] = await db
    .select()
    .from(unitTypes)
    .where(eq(unitTypes.unitName, unitName))

  return unit
}

// Finds one campaign by its fixed campaign number.
async function findCampaignByNumber(campaignNumber) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.campaignNumber, campaignNumber))

  return campaign
}

// Finds the enemy at a specific sequence inside a campaign.
async function findEnemyByCampaignAndSequence(campaignId, sequence) {
  const [enemy] = await db
    .select()
    .from(campaignEnemyArmies)
    .where(and(
      eq(campaignEnemyArmies.campaignId, campaignId),
      eq(campaignEnemyArmies.sequence, sequence)
    ))

  return enemy
}

// Inserts or updates equipment catalog rows.
async function seedEquipmentTypes() {
  // Equipment must exist before unit types can reference it.
  for (const equipmentType of EQUIPMENT_TYPES) {
    const existingEquipment = await findEquipmentByName(equipmentType.equipmentName)

    if (!existingEquipment) {
      await db.insert(equipmentTypes).values(equipmentType)
    } else {
      await db
        .update(equipmentTypes)
        .set({ description: equipmentType.description })
        .where(eq(equipmentTypes.id, existingEquipment.id))
    }
  }
}

// Inserts or updates unit catalog rows after their required equipment rows exist.
async function seedUnitTypes() {
  // Unit types reference the equipment type required for recruitment.
  for (const unitType of UNIT_TYPES) {
    const existingUnit = await findUnitByName(unitType.unitName)
    const requiredEquipment = await findEquipmentByName(unitType.requiredEquipmentName)

    if (!requiredEquipment) {
      throw new Error(`Missing equipment type ${unitType.requiredEquipmentName}`)
    }

    const unitValues = {
      unitName: unitType.unitName,
      baseStrength: unitType.baseStrength,
      requiredManpower: unitType.requiredManpower,
      requiredEquipmentTypeId: requiredEquipment.id,
      requiredEquipmentQty: unitType.requiredEquipmentQty,
      flourUpkeep: unitType.flourUpkeep,
      supplyUpkeep: unitType.supplyUpkeep,
      battleSupplyCost: unitType.battleSupplyCost
    }

    if (!existingUnit) {
      await db.insert(unitTypes).values(unitValues)
    } else {
      await db
        .update(unitTypes)
        .set(unitValues)
        .where(eq(unitTypes.id, existingUnit.id))
    }
  }
}

// Inserts or updates campaign rows and their three ordered enemy rows.
async function seedCampaigns() {
  // Each campaign receives exactly the enemy rows defined in gameBalance.js.
  for (const campaignData of CAMPAIGNS) {
    let campaign = await findCampaignByNumber(campaignData.campaignNumber)
    const campaignValues = {
      campaignNumber: campaignData.campaignNumber,
      campaignName: campaignData.campaignName,
      enemyNation: campaignData.enemyNation,
      description: campaignData.description,
      majorRewardDucats: campaignData.majorReward.ducats,
      majorRewardManpower: campaignData.majorReward.manpower,
      majorRewardSupply: campaignData.majorReward.supply,
      majorRewardMorale: campaignData.majorReward.morale,
      manpowerGainPerTurn: campaignData.manpowerGainPerTurn,
      musketsGainPerTurn: campaignData.musketsGainPerTurn,
      horsesGainPerTurn: campaignData.horsesGainPerTurn,
      fieldGunsGainPerTurn: campaignData.fieldGunsGainPerTurn,
      flourGainPerTurn: campaignData.flourGainPerTurn,
      supplyGainPerTurn: campaignData.supplyGainPerTurn
    }

    if (!campaign) {
      const [createdCampaign] = await db.insert(campaigns).values(campaignValues).returning()
      campaign = createdCampaign
    } else {
      const [updatedCampaign] = await db
        .update(campaigns)
        .set(campaignValues)
        .where(eq(campaigns.id, campaign.id))
        .returning()

      campaign = updatedCampaign
    }

    for (const enemy of campaignData.enemies) {
      // Weakness values must stay standardised for battle counter logic.
      if (!VALID_WEAKNESSES.includes(enemy.weakAgainstUnit)) {
        throw new Error(`Invalid weakness ${enemy.weakAgainstUnit} for ${enemy.enemyName}`)
      }

      const existingEnemy = await findEnemyByCampaignAndSequence(campaign.id, enemy.sequence)
      const enemyValues = {
        campaignId: campaign.id,
        sequence: enemy.sequence,
        enemyName: enemy.enemyName,
        fightingStrength: enemy.fightingStrength,
        weakAgainstUnit: enemy.weakAgainstUnit,
        minorRewardDucats: enemy.minorReward.ducats,
        minorRewardManpower: enemy.minorReward.manpower,
        minorRewardSupply: enemy.minorReward.supply
      }

      if (!existingEnemy) {
        await db.insert(campaignEnemyArmies).values(enemyValues)
      } else {
        await db
          .update(campaignEnemyArmies)
          .set(enemyValues)
          .where(eq(campaignEnemyArmies.id, existingEnemy.id))
      }
    }
  }
}

// Seeds all static game content in foreign-key-safe order.
export async function seedDatabase() {
  // Seed order matters because of foreign keys.
  await seedEquipmentTypes()
  await seedUnitTypes()
  await seedCampaigns()
  console.log('Seeded Leviathan catalog data.')
}

seedDatabase().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
