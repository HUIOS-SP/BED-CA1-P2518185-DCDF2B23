import * as campaignModel from '../models/campaignModel.js'
import {
  toCampaignTemplateEnemyView,
  toCampaignTemplateView
} from '../utils/responseFormatter.js'

// Handles the read-only campaign catalogue; endless gameplay does not depend on these rows
// Reads the three fixed campaign templates in catalogue order
export const getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await campaignModel.findAllCampaignTemplates()

    // Public views intentionally leave the legacy production/reward metadata backstage
    res.locals.data = campaigns.map(toCampaignTemplateView)
    next()
  } catch (error) {
    next(error)
  }
}

// Reads the enemies that belong to one campaign template
export const getCampaignEnemies = async (req, res, next) => {
  try {
    const campaignId = res.locals.campaignId

    const enemies = await campaignModel.findEnemiesByCampaignTemplateId(campaignId)

    // Same idea here: identity, strength, and weakness are enough for catalogue clients
    res.locals.data = enemies.map(toCampaignTemplateEnemyView)
    next()
  } catch (error) {
    next(error)
  }
}
