import * as campaignModel from '../models/campaignModel.js'

// Handles read-only campaign catalog routes.
// Reads the three fixed campaigns in campaign order.
export const getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await campaignModel.findAllCampaigns()

    res.locals.data = campaigns
    next()
  } catch (error) {
    console.error('getCampaigns error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Reads the enemies that belong to one campaign.
export const getCampaignEnemies = async (req, res, next) => {
  try {
    const campaignId = res.locals.campaignId

    const enemies = await campaignModel.findEnemiesByCampaignId(campaignId)

    res.locals.data = enemies
    next()
  } catch (error) {
    console.error('getCampaignEnemies error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
