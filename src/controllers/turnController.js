import { checkAndGetUserIdFromParams } from '../../helper.js'
import * as turnModel from '../models/turnModel.js'
import {
  calculateEquipmentGain,
  calculateTurnResult,
  calculateUnitUpkeep
} from '../utils/turnCalculator.js'

// Finds the user and their one army before advancing the turn.
async function findUserAndArmy(userId) {
  const user = await turnModel.findUserById(userId)

  if (!user) {
    return { errorStatus: 404, error: 'User not found.' }
  }

  const army = await turnModel.findArmyByUserId(userId)

  if (!army) {
    return { errorStatus: 404, error: 'Army not found for this user.' }
  }

  return { user, army }
}

// Advances the user's army by one day and applies upkeep/income.
export const advanceTurn = async (req, res) => {
  try {
    // Turn advancement changes several tables, so the model handles it in a transaction.
    const userId = checkAndGetUserIdFromParams(req, res)

    if (!userId) return

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    if (result.army.status !== 'active') {
      return res.status(409).json({ error: 'Only an active army can advance turns.' })
    }

    const resources = await turnModel.findResourcesByArmyId(result.army.id)
    const units = await turnModel.findArmyUnitsWithTypes(result.army.id)
    const equipmentRows = await turnModel.findArmyEquipmentWithTypes(result.army.id)
    const equipmentTypes = await turnModel.findAllEquipmentTypes()

    // The utility functions keep the turn maths separate from HTTP handling.
    const upkeep = calculateUnitUpkeep(units)
    const equipmentGain = calculateEquipmentGain(equipmentTypes, result.army.equipmentRate)
    const turnResult = calculateTurnResult({
      army: result.army,
      resources,
      upkeep,
      equipmentGain
    })

    await turnModel.advanceTurn({
      army: result.army,
      turnResult,
      equipmentGain,
      equipmentRows
    })

    const state = await turnModel.findArmyStateByUserId(userId)

    res.status(200).json({
      message: 'Turn advanced successfully.',
      data: state
    })
  } catch (error) {
    console.error('advanceTurn error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
