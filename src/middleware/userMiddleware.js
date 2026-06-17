import { checkAndGetPositiveInteger } from '../utils/helper.js'
import * as userArmyModel from '../models/userArmyModel.js'
import * as userModel from '../models/userModel.js'

// Validates the userId URL parameter once and shares it through res.locals.
export function checkUserId(req, res, next) {
  const userId = checkAndGetPositiveInteger(req.params.userId)

  if (!userId) {
    return res.status(400).json({ error: 'Invalid user id.' })
  }

  res.locals.userId = userId
  next()
}

// Loads the user row for routes that require an existing user.
export async function loadUser(req, res, next) {
  try {
    const user = await userModel.findUserById(res.locals.userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    res.locals.user = user
    next()
  } catch (error) {
    console.error('loadUser middleware error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Loads the user's army for gameplay routes.
export async function loadUserArmy(req, res, next) {
  try {
    const army = await userArmyModel.findArmyByUserId(res.locals.userId)

    if (!army) {
      return res.status(404).json({ error: 'Army not found for this user.' })
    }

    res.locals.army = army
    next()
  } catch (error) {
    console.error('loadUserArmy middleware error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
