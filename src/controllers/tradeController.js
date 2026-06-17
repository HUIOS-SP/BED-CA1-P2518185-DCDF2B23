import {
  checkAndGetPositiveInteger,
  getRequestBody
} from '../utils/helper.js'
import { TRADE_PRICES } from '../constants/gameBalance.js'
import * as tradeModel from '../models/tradeModel.js'

// Buys or sells flour/supply and records the trade.
export const tradeResources = async (req, res, next) => {
  try {
    // Trade is limited to buying or selling flour and supply cuz 2 is enough
    const userId = res.locals.userId
    const army = res.locals.army
    const body = getRequestBody(req)
    const { tradeType, item, quantity } = body
    const parsedQuantity = checkAndGetPositiveInteger(quantity)

    // Validate the requested trade before changing any army resources.
    if (!['buy', 'sell'].includes(tradeType)) {
      return res.status(400).json({ error: 'tradeType must be buy or sell.' })
    }

    if (!['flour', 'supply'].includes(item)) {
      return res.status(400).json({ error: 'item must be flour or supply.' })
    }

    if (!parsedQuantity) {
      return res.status(400).json({ error: 'Quantity must be a positive integer.' })
    }

    const resources = await tradeModel.findResourcesByArmyId(army.id)
    const progress = await tradeModel.findCampaignProgressByArmyId(army.id)

    if (!progress) {
      return res.status(409).json({ error: 'Army has no campaign progress.' })
    }

    if (progress.gameCompleted) {
      return res.status(409).json({ error: 'All campaigns have already been completed.' })
    }

    const price = TRADE_PRICES[item][tradeType]
    const ducatAmount = price * parsedQuantity
    const resourceChanges = {}
    let ducatsChange = 0

    if (tradeType === 'buy') {
      // Buying spends ducats and increases the chosen resource.
      //if the player has exactly enough ducats the trade should succeed and leave them with 0 ducats thats why < and not <=
      if (resources.ducats < ducatAmount) {
        return res.status(422).json({ error: 'Insufficient ducats.' })
      }

      resourceChanges.ducats = resources.ducats - ducatAmount
      resourceChanges[item] = resources[item] + parsedQuantity
      ducatsChange = -ducatAmount
    } else {
      // Selling spends the chosen resource and increases ducats.
      if (resources[item] < parsedQuantity) {
        return res.status(422).json({ error: `Insufficient ${item}.` })
      }

      resourceChanges.ducats = resources.ducats + ducatAmount
      resourceChanges[item] = resources[item] - parsedQuantity
      ducatsChange = ducatAmount
    }

    await tradeModel.tradeResources(army, progress.currentTurn, resourceChanges, {
      tradeType,
      item,
      quantity: parsedQuantity,
      ducatsChange
    })

    const state = await tradeModel.findArmyStateByUserId(userId)

    res.locals.data = state
    next()
  } catch (error) {
    console.error('tradeResources error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
