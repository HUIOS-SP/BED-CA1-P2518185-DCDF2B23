import {
  checkIfNonEmptyString,
  getRequestBody
} from '../utils/helper.js'
import {
  ARMY_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from '../constants/validation.js'
import * as userModel from '../models/userModel.js'

// Keeps the generated army name inside the same limit as user-supplied names.
function getDefaultArmyName(username) {
  const suffix = ' Army'
  const availableUsernameLength = ARMY_NAME_MAX_LENGTH - suffix.length
  return `${username.slice(0, availableUsernameLength)}${suffix}`
}

// Handles user profile CRUD routes.
// Reads all users, optionally filtered by username query parameter.
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
    console.error('getUsers error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Reads one user by the userId URL parameter.
export const getUserById = async (req, res, next) => {
  try {
    res.locals.data = res.locals.user
    next()
  } catch (error) {
    console.error('getUserById error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Creates a new user profile using username and password from the body.
export const createUser = async (req, res, next) => {
  try {
    const body = getRequestBody(req)
    const { username, password, armyName } = body

    if (!checkIfNonEmptyString(username) || !checkIfNonEmptyString(password)) {
      return res.status(400).json({
        error: 'Username and password are required.'
      })
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

    // auto create army, one user one army philosophy
    const createdGame = await userModel.createUserWithStartingArmy({
      username: trimmedUsername,
      password,
      armyName: startingArmyName
    })

    res.locals.data = {
      id: createdGame.user.id,
      username: createdGame.user.username,
      password: createdGame.user.password,
      createdAt: createdGame.user.createdAt,
      updatedAt: createdGame.user.updatedAt,
      army: createdGame.army,
      state: createdGame.state
    }
    next()
  } catch (error) {
    console.error('createUser error:', error)

    if (error.message === 'Game catalogs must be seeded before creating an army.') {
      return res.status(409).json({ error: error.message })
    }

    if (typeof error.message === 'string' && error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Updates only the username for one user.
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
    console.error('updateUser error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Deletes one user by id.
export const deleteUser = async (req, res, next) => {
  try {
    const userId = res.locals.userId

    await userModel.deleteUser(userId)

    next()
  } catch (error) {
    console.error('deleteUser error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
