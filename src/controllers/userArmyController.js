import {
  checkIfNonEmptyString,
  getRequestBody
} from '../utils/helper.js'
import { ARMY_NAME_MAX_LENGTH } from '../constants/validation.js'
import * as userArmyModel from '../models/userArmyModel.js'
import { toArmyStateView, toArmyView } from '../utils/responseFormatter.js'

// Returns the army row owned by the user
export const getUserArmy = async (req, res, next) => {
  try {
    res.locals.data = toArmyView(res.locals.army)
    next()
  } catch (error) {
    next(error)
  }
}

// Updates the user's army name
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

    res.locals.data = toArmyView(army)
    next()
  } catch (error) {
    next(error)
  }
}

// Restarts the user's game by resetting the one army to the default state
export const restartUserArmy = async (req, res, next) => {
  try {
    // Middleware guarantees that restart operates on the user's existing army
    const army = res.locals.army
    res.locals.data = await userArmyModel.restartGameForArmy(army)
    next()
  } catch (error) {
    if (error.message === 'Unit types must be seeded before restarting an army.') {
      return res.status(409).json({ error: error.message })
    }

    next(error)
  }
}

// Returns the complete gameplay snapshot when a client genuinely needs the whole state
export const getUserArmyState = async (req, res, next) => {
  try {
    // The middleware already loaded the army, so this endpoint does not query it twice
    const army = res.locals.army
    const { state, missingParts } = await userArmyModel.findArmyStateStatusByArmy(army)

    // A partial state would look valid in JSON but break gameplay, so fail loudly instead
    if (missingParts.length > 0) {
      return res.status(409).json({
        error: userArmyModel.INCOMPLETE_ARMY_STATE_ERROR
      })
    }

    res.locals.data = toArmyStateView(state)
    return next()
  } catch (error) {
    next(error)
  }
}
