import {
  checkAndGetPositiveInteger,
  getRequestBody
} from '../utils/helper.js'
import { TRADE_PRICES } from '../constants/gameBalance.js'
import * as tradeModel from '../models/tradeModel.js'
import * as userArmyModel from '../models/userArmyModel.js'

// Buys or sells flour/supply and records the trade
export const tradeResources = async (req, res, next) => {
  try {
    // The camp-follower market trades only the two consumable resources
    const army = res.locals.army
    const body = getRequestBody(req)
    const { tradeType, item, quantity } = body
    const parsedQuantity = checkAndGetPositiveInteger(quantity)

    // Validate the requested trade before changing any army resources
    if (!['buy', 'sell'].includes(tradeType)) {
      return res.status(400).json({ error: 'tradeType must be buy or sell.' })
    }

    if (!['flour', 'supply'].includes(item)) {
      return res.status(400).json({ error: 'item must be flour or supply.' })
    }

    if (!parsedQuantity) {
      return res.status(400).json({ error: 'Quantity must be a positive integer.' })
    }

    // Pull current balances once before calculating the exact trade changes
    const gameState = await userArmyModel.findArmyGameplayStateByArmyId(army.id)
    const stateError = userArmyModel.getArmyStateError(gameState)
    if (stateError) return res.status(409).json({ error: stateError })
    const { resources, progress } = gameState

    const price = TRADE_PRICES[item][tradeType]
    const ducatAmount = price * parsedQuantity
    // This object contains only the columns affected by the chosen trade
    const resourceChanges = {}
    let ducatsChange = 0

    if (tradeType === 'buy') {
      // Buying spends ducats and increases the chosen resource
      // Exact payment is valid and leaves the army with zero ducats
      if (resources.ducats < ducatAmount) {
        return res.status(422).json({ error: 'Insufficient ducats.' })
      }

      resourceChanges.ducats = resources.ducats - ducatAmount
      resourceChanges[item] = resources[item] + parsedQuantity
      ducatsChange = -ducatAmount
    } else {
      // Selling spends the chosen resource and increases ducats
      if (resources[item] < parsedQuantity) {
        return res.status(422).json({ error: `Insufficient ${item}.` })
      }

      resourceChanges.ducats = resources.ducats + ducatAmount
      resourceChanges[item] = resources[item] - parsedQuantity
      ducatsChange = ducatAmount
    }

    // The balance update and matching log entry commit together, as they should
    const result = await tradeModel.tradeResources(army, progress.currentTurn, resourceChanges, {
      tradeType,
      item,
      quantity: parsedQuantity,
      ducatsChange
    })

    res.locals.data = result
    next()
  } catch (error) {
    next(error)
  }
}
