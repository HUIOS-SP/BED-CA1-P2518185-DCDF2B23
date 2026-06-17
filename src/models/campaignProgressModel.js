import { and, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import {
  armyCampaignProgress,
  campaignEnemyArmies,
  campaigns
} from '../db/schema.js'

// Campaign progress model reads the user's one linear progress row.
// Reads the user's current campaign and current enemy details.
export async function findCampaignProgressByArmyId(armyId) {
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
