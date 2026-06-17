import { checkAndGetUserIdFromParams } from '../../helper.js'
import * as campaignProgressModel from '../models/campaignProgressModel.js'

// Finds the user and army before reading campaign progress.
async function findUserAndArmy(userId) {
  const user = await campaignProgressModel.findUserById(userId)

  if (!user) {
    return { errorStatus: 404, error: 'User not found.' }
  }

  const army = await campaignProgressModel.findArmyByUserId(userId)

  if (!army) {
    return { errorStatus: 404, error: 'Army not found for this user.' }
  }

  return { user, army }
}

// Returns the user's current campaign number and current enemy sequence.
export const getCampaignProgress = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    const progress = await campaignProgressModel.findCampaignProgressByArmyId(result.army.id)

    if (!progress) {
      return res.status(404).json({ error: 'Campaign progress not found for this army.' })
    }

    res.status(200).json({
      message: 'Campaign progress retrieved successfully.',
      data: progress
    })
  } catch (error) {
    console.error('getCampaignProgress error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
