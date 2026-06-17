import {
  checkAndGetPositiveInteger,
  checkAndGetUserIdFromParams,
  checkIfNonEmptyString,
  getRequestBody
} from '../../helper.js'
import * as recruitModel from '../models/recruitModel.js'

// Shared lookup for routes that are based on a user's one army.
async function findUserAndArmy(userId) {
  const user = await recruitModel.findUserById(userId)

  if (!user) {
    return { errorStatus: 404, error: 'User not found.' }
  }

  const army = await recruitModel.findArmyByUserId(userId)

  if (!army) {
    return { errorStatus: 404, error: 'Army not found for this user.' }
  }

  return { user, army }
}

// Recruits a unit type into the user's army after checking costs.
export const recruitUnits = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    // Recruitment only accepts unitName to keep the CA1 API easy to read.
    const body = getRequestBody(req)
    const { unitName, quantity } = body
    const parsedQuantity = checkAndGetPositiveInteger(quantity)

    if (!checkIfNonEmptyString(unitName)) {
      return res.status(400).json({ error: 'unitName is required.' })
    }

    if (!parsedQuantity) {
      return res.status(400).json({ error: 'Quantity must be a positive integer.' })
    }

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    const unitType = await recruitModel.findUnitTypeByName(unitName.trim())

    if (!unitType) {
      return res.status(404).json({ error: 'Unit type not found.' })
    }

    const resources = await recruitModel.findResourcesByArmyId(result.army.id)
    const equipment = await recruitModel.findArmyEquipmentByTypeId(
      result.army.id,
      unitType.requiredEquipmentTypeId
    )
    const armyUnit = await recruitModel.findArmyUnitByTypeId(result.army.id, unitType.id)

    // Recruitment cost scales by quantity requested.
    const manpowerCost = unitType.requiredManpower * parsedQuantity
    const equipmentCost = unitType.requiredEquipmentQty * parsedQuantity

    // 422 means the request is valid, but the game action cannot be paid for.
    if (resources.manpower < manpowerCost) {
      return res.status(422).json({ error: 'Insufficient manpower.' })
    }

    if (!equipment || equipment.quantity < equipmentCost) {
      return res.status(422).json({ error: 'Insufficient required equipment.' })
    }

    await recruitModel.recruitUnits({
      army: result.army,
      resources,
      equipment,
      armyUnit,
      unitType,
      manpowerCost,
      equipmentCost,
      quantity: parsedQuantity
    })

    const state = await recruitModel.findArmyStateByUserId(userId)

    res.status(200).json({
      message: 'Units recruited successfully.',
      data: state
    })
  } catch (error) {
    console.error('recruitUnits error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
