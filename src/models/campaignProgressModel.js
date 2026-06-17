import { and, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import {
  armies,
  armyCampaignProgress,
  campaignEnemyArmies,
  campaigns,
  users
} from '../db/schema.js'

// Campaign progress model reads the user's one linear progress row.
// Reads one user before campaign progress actions.
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

// Reads the one army owned by a user.
export async function findArmyByUserId(userId) {
  const [army] = await db.select().from(armies).where(eq(armies.userId, userId))
  return army
}

// Reads the user's current campaign and current enemy details.
export async function findCampaignProgressByArmyId(armyId) {
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
