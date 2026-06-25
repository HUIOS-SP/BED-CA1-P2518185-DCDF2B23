import { checkAndGetPositiveInteger } from '../utils/helper.js'
import * as campaignModel from '../models/campaignModel.js'

// Validates campaignId once for the read-only catalogue routes
export function checkCampaignId(req, res, next) {
  const campaignId = checkAndGetPositiveInteger(req.params.campaignId)

  if (!campaignId) {
    return res.status(400).json({ error: 'Invalid campaign id.' })
  }

  res.locals.campaignId = campaignId
  next()
}

// Loads the catalogue row early so later middleware does not repeat the same query
export async function loadCampaign(req, res, next) {
  try {
    const campaign = await campaignModel.findCampaignTemplateById(res.locals.campaignId)

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' })
    }

    res.locals.campaign = campaign
    next()
  } catch (error) {
    next(error)
  }
}
