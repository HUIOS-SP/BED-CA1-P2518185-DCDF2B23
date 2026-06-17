import { checkAndGetPositiveInteger } from '../utils/helper.js'
import * as campaignModel from '../models/campaignModel.js'

// Validates the campaignId URL parameter once for campaign catalog routes.
export function checkCampaignId(req, res, next) {
  const campaignId = checkAndGetPositiveInteger(req.params.campaignId)

  if (!campaignId) {
    return res.status(400).json({ error: 'Invalid campaign id.' })
  }

  res.locals.campaignId = campaignId
  next()
}

// Loads the campaign row so later route functions do not repeat the lookup.
export async function loadCampaign(req, res, next) {
  try {
    const campaign = await campaignModel.findCampaignById(res.locals.campaignId)

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' })
    }

    res.locals.campaign = campaign
    next()
  } catch (error) {
    console.error('loadCampaign middleware error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
