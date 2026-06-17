import {
  checkAndGetLimitFromQuery,
  checkAndGetUserIdFromParams,
  checkIfNonEmptyString
} from '../../helper.js'
import * as armyLogModel from '../models/armyLogModel.js'

// Finds the user and army before reading army-owned logs.
async function findUserAndArmy(userId) {
  const user = await armyLogModel.findUserById(userId)

  if (!user) {
    return { errorStatus: 404, error: 'User not found.' }
  }

  const army = await armyLogModel.findArmyByUserId(userId)

  if (!army) {
    return { errorStatus: 404, error: 'Army not found for this user.' }
  }

  return { user, army }
}

// Reads generic army_log rows for the user's one army.
export const getArmyLogs = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    // Query inputs are optional: eventType filters log category, limit caps row count.
    const { eventType } = req.query
    const limit = checkAndGetLimitFromQuery(req, res)
    if (limit === null) return

    if (eventType !== undefined && !checkIfNonEmptyString(eventType)) {
      return res.status(400).json({ error: 'eventType query must be a non-empty string.' })
    }

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    const filters = { limit }

    if (eventType) {
      filters.eventType = eventType.trim()
    }

    const logs = await armyLogModel.findArmyLogsByArmyId(result.army.id, filters)

    res.status(200).json({
      message: 'Army logs retrieved successfully.',
      data: logs
    })
  } catch (error) {
    console.error('getArmyLogs error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
