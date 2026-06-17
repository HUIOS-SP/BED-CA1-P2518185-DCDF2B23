import { checkAndGetCampaignIdFromParams } from '../../helper.js'
import * as campaignModel from '../models/campaignModel.js'

// Handles read-only campaign catalog routes.
// Reads the three fixed campaigns in campaign order.
export const getCampaigns = async (req, res) => {
  try {
    const campaigns = await campaignModel.findAllCampaigns()

    res.status(200).json({
      message: 'Campaigns retrieved successfully.',
      data: campaigns
    })
  } catch (error) {
    console.error('getCampaigns error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Reads the enemies that belong to one campaign.
export const getCampaignEnemies = async (req, res) => {
  try {
    const campaignId = checkAndGetCampaignIdFromParams(req, res)

    if (!campaignId) return

    const campaign = await campaignModel.findCampaignById(campaignId)

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' })
    }

    const enemies = await campaignModel.findEnemiesByCampaignId(campaignId)

    res.status(200).json({
      message: 'Campaign enemies retrieved successfully.',
      data: enemies
    })
  } catch (error) {
    console.error('getCampaignEnemies error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
