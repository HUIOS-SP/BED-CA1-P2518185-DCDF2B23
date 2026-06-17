import {
  checkAndGetLimitFromQuery,
  checkIfNonEmptyString
} from '../utils/helper.js'
import * as armyLogModel from '../models/armyLogModel.js'

// Reads generic army_log rows for the user's one army.
export const getArmyLogs = async (req, res, next) => {
  try {
    const army = res.locals.army

    // Query inputs are optional: eventType filters log category, limit caps row count.
    const { eventType } = req.query
    const limit = checkAndGetLimitFromQuery(req, res)
    if (limit === null) return

    if (eventType !== undefined && !checkIfNonEmptyString(eventType)) {
      return res.status(400).json({ error: 'eventType query must be a non-empty string.' })
    }

    const filters = { limit }

    if (eventType) {
      filters.eventType = eventType.trim()
    }

    const logs = await armyLogModel.findArmyLogsByArmyId(army.id, filters)

    res.locals.data = logs
    next()
  } catch (error) {
    console.error('getArmyLogs error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
