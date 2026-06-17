import * as campaignProgressModel from '../models/campaignProgressModel.js'

// Returns the user's current campaign number and current enemy sequence.
export const getCampaignProgress = async (req, res, next) => {
  try {
    const army = res.locals.army

    const progress = await campaignProgressModel.findCampaignProgressByArmyId(army.id)

    if (!progress) {
      return res.status(404).json({ error: 'Campaign progress not found for this army.' })
    }

    res.locals.data = progress
    next()
  } catch (error) {
    console.error('getCampaignProgress error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
