import { asc, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { campaignTemplateEnemies, campaignTemplates } from '../db/schema.js'

// Campaign model reads static flavour catalogue rows; active gameplay generates its own enemies
// Reads all campaign templates in catalogue-number order
export async function findAllCampaignTemplates() {
  return db
    .select()
    .from(campaignTemplates)
    .orderBy(asc(campaignTemplates.campaignNumber))
}

// Reads one campaign by id
export async function findCampaignTemplateById(campaignTemplateId) {
  const [campaignTemplate] = await db
    .select()
    .from(campaignTemplates)
    .where(eq(campaignTemplates.id, campaignTemplateId))
  return campaignTemplate
}

// Reads enemy rows that belong to a campaign template in battle order
export async function findEnemiesByCampaignTemplateId(campaignTemplateId) {
  return db
    .select()
    .from(campaignTemplateEnemies)
    .where(eq(campaignTemplateEnemies.campaignTemplateId, campaignTemplateId))
    .orderBy(asc(campaignTemplateEnemies.sequence))
}
