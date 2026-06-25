import {
  checkAndGetLimitFromQuery,
  checkIfNonEmptyString
} from '../utils/helper.js'
import * as armyLogModel from '../models/armyLogModel.js'
import { toArmyLogView } from '../utils/responseFormatter.js'

// Reads the army journal and exposes only the public log shape
export const getArmyLogs = async (req, res, next) => {
  try {
    const army = res.locals.army

    // Both filters are optional: eventType selects a category and limit caps the result count
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

    // Format at the API boundary so internal army IDs stay internal
    res.locals.data = logs.map(toArmyLogView)
    next()
  } catch (error) {
    next(error)
  }
}
