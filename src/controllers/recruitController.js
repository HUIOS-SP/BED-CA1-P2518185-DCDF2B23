import {
  checkAndGetPositiveInteger,
  checkIfNonEmptyString,
  getRequestBody
} from '../utils/helper.js'
import * as recruitModel from '../models/recruitModel.js'

// Recruits a unit type into the user's army after checking costs.
export const recruitUnits = async (req, res, next) => {
  try {
    const userId = res.locals.userId
    const army = res.locals.army

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

    const unitType = await recruitModel.findUnitTypeByName(unitName.trim())

    if (!unitType) {
      return res.status(404).json({ error: 'Unit type not found.' })
    }

    const resources = await recruitModel.findResourcesByArmyId(army.id)
    const progress = await recruitModel.findCampaignProgressByArmyId(army.id)

    if (!progress) {
      return res.status(409).json({ error: 'Army has no campaign progress.' })
    }

    if (progress.gameCompleted) {
      return res.status(409).json({ error: 'All campaigns have already been completed.' })
    }

    const equipment = await recruitModel.findArmyEquipmentByTypeId(
      army.id,
      unitType.requiredEquipmentTypeId
    )
    const armyUnit = await recruitModel.findArmyUnitByTypeId(army.id, unitType.id)

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
      army,
      resources,
      equipment,
      armyUnit,
      unitType,
      manpowerCost,
      equipmentCost,
      quantity: parsedQuantity,
      currentTurn: progress.currentTurn
    })

    const state = await recruitModel.findArmyStateByUserId(userId)

    res.locals.data = state
    next()
  } catch (error) {
    console.error('recruitUnits error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
