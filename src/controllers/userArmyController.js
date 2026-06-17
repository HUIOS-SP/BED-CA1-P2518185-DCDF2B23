import {
  checkAndGetUserIdFromParams,
  checkIfNonEmptyString,
  getRequestBody
} from '../../helper.js'
import * as userArmyModel from '../models/userArmyModel.js'

// Finds the user first, then the user's one army.
async function findUserAndArmy(userId) {
  const user = await userArmyModel.findUserById(userId)

  if (!user) {
    return { errorStatus: 404, error: 'User not found.' }
  }

  const army = await userArmyModel.findArmyByUserId(userId)

  if (!army) {
    return { errorStatus: 404, error: 'Army not found for this user.' }
  }

  return { user, army }
}

// Returns the army row owned by the user.
export const getUserArmy = async (req, res) => {
  try {
    // Helper validates the route id and sends 400 if invalid.
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    res.status(200).json({
      message: 'Army retrieved successfully.',
      data: result.army
    })
  } catch (error) {
    console.error('getUserArmy error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Creates the user's one army and automatically starts Unix Wars.
export const createUserArmy = async (req, res) => {
  try {
    // Army creation also creates starting resources, equipment, units, and campaign progress.
    const userId = checkAndGetUserIdFromParams(req, res)
    const body = getRequestBody(req)
    const { armyName } = body

    if (!userId) return

    if (!checkIfNonEmptyString(armyName)) {
      return res.status(400).json({ error: 'Army name is required.' })
    }

    const user = await userArmyModel.findUserById(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const existingArmy = await userArmyModel.findArmyByUserId(userId)

    if (existingArmy) {
      return res.status(409).json({ error: 'User already has an army.' })
    }

    const equipmentTypes = await userArmyModel.findAllEquipmentTypes()
    const unitTypes = await userArmyModel.findAllUnitTypes()

    if (equipmentTypes.length === 0 || unitTypes.length === 0) {
      return res.status(409).json({ error: 'Game catalogs must be seeded before creating an army.' })
    }

    const army = await userArmyModel.createArmyForUser(userId, armyName.trim())
    const state = await userArmyModel.findArmyStateByUserId(userId)

    res.status(201).json({
      message: 'Army created successfully.',
      data: {
        army,
        state
      }
    })
  } catch (error) {
    console.error('createUserArmy error:', error)

    if (error.message === 'Game catalogs must be seeded before creating an army.') {
      return res.status(409).json({ error: error.message })
    }

    if (typeof error.message === 'string' && error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'User already has an army.' })
    }

    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Updates the user's army name.
export const updateUserArmy = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    const body = getRequestBody(req)
    const { armyName } = body

    if (!userId) return

    if (!checkIfNonEmptyString(armyName)) {
      return res.status(400).json({ error: 'Army name is required.' })
    }

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    const army = await userArmyModel.updateArmyNameByUserId(userId, armyName.trim())

    res.status(200).json({
      message: 'Army updated successfully.',
      data: army
    })
  } catch (error) {
    console.error('updateUserArmy error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Deletes the user's army and dependent rows through cascade rules.
export const deleteUserArmy = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    await userArmyModel.deleteArmyByUserId(userId)

    res.status(204).send()
  } catch (error) {
    console.error('deleteUserArmy error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Restarts the user's game by resetting the one army to the default state.
export const restartUserArmy = async (req, res) => {
  try {
    // Restart uses the userId route input and does not need a request body.
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const user = await userArmyModel.findUserById(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const defaultArmyName = `${user.username} Army`
    const restartResult = await userArmyModel.restartGameForUser(userId, defaultArmyName)
    const state = await userArmyModel.findArmyStateByUserId(userId)
    let message = 'Game restarted successfully.'

    if (restartResult.createdArmy) {
      message = 'Starting army created and Unix Wars started successfully.'
    }

    res.status(200).json({
      message,
      data: state
    })
  } catch (error) {
    console.error('restartUserArmy error:', error)

    if (
      error.message === 'Game catalogs must be seeded before creating an army.' ||
      error.message === 'Game catalogs must be seeded before restarting an army.'
    ) {
      return res.status(409).json({ error: error.message })
    }

    res.status(500).json({ error: 'Internal Server Error.' })
  }
}

// Returns the full army state: resources, equipment, units, and campaign progress.
export const getUserArmyState = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const user = await userArmyModel.findUserById(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const state = await userArmyModel.findArmyStateByUserId(userId)

    if (!state) {
      return res.status(404).json({ error: 'Army not found for this user.' })
    }

    res.status(200).json({
      message: 'Army state retrieved successfully.',
      data: state
    })
  } catch (error) {
    console.error('getUserArmyState error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
