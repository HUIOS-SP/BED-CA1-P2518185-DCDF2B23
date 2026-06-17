import {
  checkIfNonEmptyString,
  getRequestBody
} from '../utils/helper.js'
import { ARMY_NAME_MAX_LENGTH } from '../constants/validation.js'
import * as userArmyModel from '../models/userArmyModel.js'

// Returns the army row owned by the user.
export const getUserArmy = async (req, res, next) => {
  try {
    res.locals.data = res.locals.army
    next()
  } catch (error) {
    console.error('getUserArmy error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Updates the user's army name.
export const updateUserArmy = async (req, res, next) => {
  try {
    const userId = res.locals.userId
    const body = getRequestBody(req)
    const { armyName } = body

    if (!checkIfNonEmptyString(armyName)) {
      return res.status(400).json({ error: 'Army name is required.' })
    }

    const trimmedArmyName = armyName.trim()

    if (trimmedArmyName.length > ARMY_NAME_MAX_LENGTH) {
      return res.status(400).json({
        error: `Army name must be ${ARMY_NAME_MAX_LENGTH} characters or fewer.`
      })
    }

    const army = await userArmyModel.updateArmyNameByUserId(userId, trimmedArmyName)

    res.locals.data = army
    next()
  } catch (error) {
    console.error('updateUserArmy error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Restarts the user's game by resetting the one army to the default state.
export const restartUserArmy = async (req, res, next) => {
  try {
    // Middleware guarantees that restart operates on the user's existing army.
    const army = res.locals.army
    const restartedArmy = await userArmyModel.restartGameForArmy(army)
    const state = await userArmyModel.findArmyStateByArmy(restartedArmy)

    res.locals.data = state
    next()
  } catch (error) {
    console.error('restartUserArmy error:', error)

    if (
      error.message === 'Game catalogs must be seeded before restarting an army.'
    ) {
      return res.status(409).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Returns the full army state: resources, equipment, units, and campaign progress. easier back-end debugging
export const getUserArmyState = async (req, res, next) => {
  try {
    // The middleware already loaded the army, so this endpoint does not query it twice.
    const army = res.locals.army
    const state = await userArmyModel.findArmyStateByArmy(army)

    // Never return 200 with undefined properties, because JSON omits those properties.
    if (!state.resources || !state.campaignProgress) {
      return res.status(409).json({
        error: 'Army state is incomplete. Restart the game to restore required state.'
      })
    }

    res.locals.data = state
    return next()
  } catch (error) {
    console.error('getUserArmyState error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
