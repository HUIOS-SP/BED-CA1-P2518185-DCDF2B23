import {
  checkIfNonEmptyString,
  getRequestBody
} from '../utils/helper.js'
import {
  ARMY_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from '../constants/validation.js'
import * as userModel from '../models/userModel.js'
import { toArmyView } from '../utils/responseFormatter.js'

// Keeps the generated army name inside the same limit as user-supplied names
function getDefaultArmyName(username) {
  const suffix = ' Army'
  const availableUsernameLength = ARMY_NAME_MAX_LENGTH - suffix.length
  return `${username.slice(0, availableUsernameLength)}${suffix}`
}

// Handles user profile CRUD routes
// Reads all users, optionally filtered by username query parameter
export const getUsers = async (req, res, next) => {
  try {
    const { username } = req.query

    if (username !== undefined && !checkIfNonEmptyString(username)) {
      return res.status(400).json({ error: 'Username query must be a non-empty string.' })
    }

    const filters = {}

    if (username) {
      filters.username = username.trim()
    }

    const users = await userModel.findAllUsers(filters)

    res.locals.data = users
    next()
  } catch (error) {
    next(error)
  }
}

// Reads one user by the userId URL parameter
export const getUserById = async (req, res, next) => {
  try {
    res.locals.data = res.locals.user
    next()
  } catch (error) {
    next(error)
  }
}

// Creates a new user profile and its starter army
export const createUser = async (req, res, next) => {
  try {
    const body = getRequestBody(req)
    const { username, armyName } = body

    if (!checkIfNonEmptyString(username)) {
      return res.status(400).json({ error: 'Username is required.' })
    }

    const trimmedUsername = username.trim()

    if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
      return res.status(400).json({
        error: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`
      })
    }

    let startingArmyName = getDefaultArmyName(trimmedUsername)

    if (armyName !== undefined) {
      if (!checkIfNonEmptyString(armyName)) {
        return res.status(400).json({ error: 'Army name must be a non-empty string.' })
      }

      const trimmedArmyName = armyName.trim()

      if (trimmedArmyName.length > ARMY_NAME_MAX_LENGTH) {
        return res.status(400).json({
          error: `Army name must be ${ARMY_NAME_MAX_LENGTH} characters or fewer.`
        })
      }

      startingArmyName = trimmedArmyName
    }

    const existingUser = await userModel.findUserByUsername(trimmedUsername)

    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    // One user, one army: create both together so nobody spawns into the void
    const createdGame = await userModel.createUserWithStartingArmy({
      username: trimmedUsername,
      armyName: startingArmyName
    })

    res.locals.data = {
      id: createdGame.user.id,
      username: createdGame.user.username,
      createdAt: createdGame.user.createdAt,
      updatedAt: createdGame.user.updatedAt,
      army: toArmyView(createdGame.army)
    }
    next()
  } catch (error) {
    if (error.message === 'Unit types must be seeded before creating an army.') {
      return res.status(409).json({ error: error.message })
    }

    // The earlier lookup gives a friendly error; this also covers a last-second race
    if (typeof error.message === 'string' && error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    next(error)
  }
}

// Updates only the username for one user
export const updateUser = async (req, res, next) => {
  try {
    const userId = res.locals.userId
    const body = getRequestBody(req)
    const { username } = body

    if (!checkIfNonEmptyString(username)) {
      return res.status(400).json({ error: 'Username is required.' })
    }

    const trimmedUsername = username.trim()

    if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
      return res.status(400).json({
        error: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`
      })
    }

    const existingUser = await userModel.findUserByUsername(trimmedUsername)

    if (existingUser && existingUser.id !== userId) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    const updatedUser = await userModel.updateUsername(userId, trimmedUsername)

    res.locals.data = updatedUser
    next()
  } catch (error) {
    next(error)
  }
}

// Deletes one user by id
export const deleteUser = async (req, res, next) => {
  try {
    const userId = res.locals.userId

    await userModel.deleteUser(userId)

    next()
  } catch (error) {
    next(error)
  }
}
