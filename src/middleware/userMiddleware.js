import { checkAndGetPositiveInteger } from '../utils/helper.js'
import * as userArmyModel from '../models/userArmyModel.js'
import * as userModel from '../models/userModel.js'

// Validates userId once and shares the parsed number through res.locals
export function checkUserId(req, res, next) {
  const userId = checkAndGetPositiveInteger(req.params.userId)

  if (!userId) {
    return res.status(400).json({ error: 'Invalid user id.' })
  }

  res.locals.userId = userId
  next()
}

// Loads the user row before the controller, so controllers can focus on their actual job
export async function loadUser(req, res, next) {
  try {
    const user = await userModel.findUserById(res.locals.userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    res.locals.user = user
    next()
  } catch (error) {
    next(error)
  }
}

// Loads the user's one army, with the schema enforcing one-user-one-army to keep this simple
export async function loadUserArmy(req, res, next) {
  try {
    const army = await userArmyModel.findArmyByUserId(res.locals.userId)

    if (!army) {
      return res.status(404).json({ error: 'Army not found for this user.' })
    }

    res.locals.army = army
    next()
  } catch (error) {
    next(error)
  }
}
