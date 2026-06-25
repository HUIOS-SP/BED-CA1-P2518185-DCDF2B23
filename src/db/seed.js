import { and, eq } from 'drizzle-orm'
import { db } from './db.js'
import {
  campaignTemplateEnemies,
  campaignTemplates,
  unitTypes
} from './schema.js'
import {
  CAMPAIGN_TEMPLATES,
  UNIT_TYPES,
  VALID_WEAKNESSES
} from '../constants/gameBalance.js'

// Small lookup helpers make the upsert-style seed flow easy to follow
async function findUnitByName(unitName) {
  const [unit] = await db
    .select()
    .from(unitTypes)
    .where(eq(unitTypes.unitName, unitName))

  return unit
}

// Finds one campaign template by its fixed catalogue number
async function findCampaignByNumber(campaignNumber) {
  const [campaign] = await db
    .select()
    .from(campaignTemplates)
    .where(eq(campaignTemplates.campaignNumber, campaignNumber))

  return campaign
}

// Finds the enemy at a specific sequence inside a campaign template
async function findEnemyByTemplateAndSequence(campaignTemplateId, sequence) {
  const [enemy] = await db
    .select()
    .from(campaignTemplateEnemies)
    .where(and(
      eq(campaignTemplateEnemies.campaignTemplateId, campaignTemplateId),
      eq(campaignTemplateEnemies.sequence, sequence)
    ))

  return enemy
}

// Inserts new unit rules or refreshes existing ones, making the seed safe to rerun
async function seedUnitTypes() {
  for (const unitType of UNIT_TYPES) {
    const existingUnit = await findUnitByName(unitType.unitName)

    const unitValues = {
      unitName: unitType.unitName,
      baseStrength: unitType.baseStrength,
      requiredManpower: unitType.requiredManpower,
      requiredEquipment: unitType.requiredEquipment,
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

// Inserts or updates catalogue templates and their three ordered flavour enemies
async function seedCampaignTemplates() {
  // gameBalance.js is the seed source of truth; the database mirrors it on every run
  for (const campaignData of CAMPAIGN_TEMPLATES) {
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
      const [createdCampaign] = await db.insert(campaignTemplates).values(campaignValues).returning()
      campaign = createdCampaign
    } else {
      const [updatedCampaign] = await db
        .update(campaignTemplates)
        .set(campaignValues)
        .where(eq(campaignTemplates.id, campaign.id))
        .returning()

      campaign = updatedCampaign
    }

    for (const enemy of campaignData.enemies) {
      // Catch bad seed data early; a typo here would quietly break counter logic later
      if (!VALID_WEAKNESSES.includes(enemy.weakAgainstUnit)) {
        throw new Error(`Invalid weakness ${enemy.weakAgainstUnit} for ${enemy.enemyName}`)
      }

      const existingEnemy = await findEnemyByTemplateAndSequence(campaign.id, enemy.sequence)
      const enemyValues = {
        campaignTemplateId: campaign.id,
        sequence: enemy.sequence,
        enemyName: enemy.enemyName,
        fightingStrength: enemy.fightingStrength,
        weakAgainstUnit: enemy.weakAgainstUnit,
        minorRewardDucats: enemy.minorReward.ducats,
        minorRewardManpower: enemy.minorReward.manpower,
        minorRewardSupply: enemy.minorReward.supply
      }

      if (!existingEnemy) {
        await db.insert(campaignTemplateEnemies).values(enemyValues)
      } else {
        await db
          .update(campaignTemplateEnemies)
          .set(enemyValues)
          .where(eq(campaignTemplateEnemies.id, existingEnemy.id))
      }
    }
  }
}

// Seed parent rows before child rows so foreign-key inserts do not fail
export async function seedDatabase() {
  await seedUnitTypes()
  await seedCampaignTemplates()
  console.log('Seeded Leviathan catalog data.')
}

seedDatabase().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
