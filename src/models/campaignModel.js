import { asc, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { campaignEnemyArmies, campaigns } from '../db/schema.js'

// Campaign model reads the static three-campaign catalog and its enemies.
// Reads all campaigns in campaign number order.
export async function findAllCampaigns() {
  return await db
    .select()
    .from(campaigns)
    .orderBy(asc(campaigns.campaignNumber))
}

// Reads one campaign by id.
export async function findCampaignById(campaignId) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  return campaign
}

// Reads enemy rows that belong to a campaign in battle order.
export async function findEnemiesByCampaignId(campaignId) {
  return await db
    .select()
    .from(campaignEnemyArmies)
    .where(eq(campaignEnemyArmies.campaignId, campaignId))
    .orderBy(asc(campaignEnemyArmies.sequence))
}
