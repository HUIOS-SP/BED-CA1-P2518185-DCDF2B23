import {
  checkAndGetPositiveInteger,
  checkIfNonEmptyString,
  getRequestBody
} from '../utils/helper.js'
import * as recruitModel from '../models/recruitModel.js'
import * as userArmyModel from '../models/userArmyModel.js'
import { getEquipmentColumnKey } from '../utils/equipment.js'

// Recruits a unit type into the user's army after checking costs
export const recruitUnits = async (req, res, next) => {
  try {
    const army = res.locals.army

    // Recruitment only accepts unitName to keep the CA1 API easy to read
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

    // Recruitment needs resources, equipment, units, and turn number from one consistent snapshot
    const gameState = await userArmyModel.findArmyGameplayStateByArmyId(army.id)
    const stateError = userArmyModel.getArmyStateError(gameState)
    if (stateError) return res.status(409).json({ error: stateError })
    const { resources, equipment, progress, units } = gameState

    // Convert database-style equipment names into safe Drizzle property names
    const equipmentKey = getEquipmentColumnKey(unitType.requiredEquipment)
    if (!equipmentKey) return res.status(409).json({ error: 'Unit type has an invalid equipment requirement.' })
    const armyUnit = units.find((unit) => unit.unitTypeId === unitType.id)

    // Recruitment cost scales by quantity requested
    const manpowerCost = unitType.requiredManpower * parsedQuantity
    const equipmentCost = unitType.requiredEquipmentQty * parsedQuantity

    // 422 means the request is valid, but the game action cannot be paid for
    if (resources.manpower < manpowerCost) {
      return res.status(422).json({ error: 'Insufficient manpower.' })
    }

    if (equipment[equipmentKey] < equipmentCost) {
      return res.status(422).json({ error: 'Insufficient required equipment.' })
    }

    // The model spends both costs and adds the unit in one transaction, avoiding half-recruited chaos
    const result = await recruitModel.recruitUnits({
      army,
      resources,
      equipment,
      equipmentKey,
      armyUnit,
      unitType,
      manpowerCost,
      equipmentCost,
      quantity: parsedQuantity,
      currentTurn: progress.currentTurn
    })

    res.locals.data = result
    next()
  } catch (error) {
    next(error)
  }
}
