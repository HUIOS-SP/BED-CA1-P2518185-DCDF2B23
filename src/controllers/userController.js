import {
  checkAndGetUserIdFromParams,
  checkIfNonEmptyString,
  getRequestBody
} from '../../helper.js'
import * as userModel from '../models/userModel.js'

// Handles user profile CRUD routes.
// Reads all users, optionally filtered by username query parameter.
export const getUsers = async (req, res) => {
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

    res.status(200).json({
      message: 'Users retrieved successfully.',
      data: users
    })
  } catch (error) {
    console.error('getUsers error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Reads one user by the userId URL parameter.
export const getUserById = async (req, res) => {
  try {
    // Helper validates the route id and sends 400 if invalid.
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const user = await userModel.findUserById(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    res.status(200).json({
      message: 'User retrieved successfully.',
      data: user
    })
  } catch (error) {
    console.error('getUserById error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Creates a new user profile using username and password from the body.
export const createUser = async (req, res) => {
  try {
    const body = getRequestBody(req)
    const { username, password, armyName } = body

    if (!checkIfNonEmptyString(username) || !checkIfNonEmptyString(password)) {
      return res.status(400).json({
        error: 'Username and password are required.'
      })
    }

    const trimmedUsername = username.trim()
    let startingArmyName = `${trimmedUsername} Army`

    if (armyName !== undefined) {
      if (!checkIfNonEmptyString(armyName)) {
        return res.status(400).json({ error: 'Army name must be a non-empty string.' })
      }

      startingArmyName = armyName.trim()
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

    res.status(201).json({
      message: 'User created successfully. Starting army created and Unix Wars started.',
      data: {
        id: createdGame.user.id,
        username: createdGame.user.username,
        password: createdGame.user.password,
        createdAt: createdGame.user.createdAt,
        updatedAt: createdGame.user.updatedAt,
        army: createdGame.army,
        state: createdGame.state
      }
    })
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
export const updateUser = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    const body = getRequestBody(req)
    const { username } = body

    if (!userId) return

    if (!checkIfNonEmptyString(username)) {
      return res.status(400).json({ error: 'Username is required.' })
    }

    const user = await userModel.findUserById(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const existingUser = await userModel.findUserByUsername(username.trim())

    if (existingUser && existingUser.id !== userId) {
      return res.status(409).json({ error: 'Username already exists.' })
    }

    const updatedUser = await userModel.updateUsername(userId, username.trim())

    res.status(200).json({
      message: 'User updated successfully.',
      data: updatedUser
    })
  } catch (error) {
    console.error('updateUser error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Deletes one user by id.
export const deleteUser = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const deletedUser = await userModel.deleteUser(userId)

    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found.' })
    }

    res.status(204).send()
  } catch (error) {
    console.error('deleteUser error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
