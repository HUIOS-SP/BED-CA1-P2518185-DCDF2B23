import {
  checkAndGetPositiveInteger,
  checkAndGetUserIdFromParams,
  getRequestBody
} from '../../helper.js'
import { TRADE_PRICES } from '../constants/gameBalance.js'
import * as tradeModel from '../models/tradeModel.js'

// Finds the profile and the one army before any trade action.
async function findUserAndArmy(userId) {
  const user = await tradeModel.findUserById(userId)

  if (!user) {
    return { errorStatus: 404, error: 'User not found.' }
  }

  const army = await tradeModel.findArmyByUserId(userId)

  if (!army) {
    return { errorStatus: 404, error: 'Army not found for this user.' }
  }

  return { user, army }
}

// Buys or sells flour/supply and records the trade.
export const tradeResources = async (req, res) => {
  try {
    // Trade is limited to buying or selling flour and supply.
    const userId = checkAndGetUserIdFromParams(req, res)
    const body = getRequestBody(req)
    const { tradeType, item, quantity } = body
    const parsedQuantity = checkAndGetPositiveInteger(quantity)

    if (!userId) return

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

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    const resources = await tradeModel.findResourcesByArmyId(result.army.id)
    const price = TRADE_PRICES[item][tradeType]
    const ducatAmount = price * parsedQuantity
    const resourceChanges = {}
    let ducatsChange = 0

    if (tradeType === 'buy') {
      // Buying spends ducats and increases the chosen resource.
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

    await tradeModel.tradeResources(result.army, resourceChanges, {
      tradeType,
      item,
      quantity: parsedQuantity,
      ducatsChange
    })

    const state = await tradeModel.findArmyStateByUserId(userId)

    res.status(200).json({
      message: 'Trade completed successfully.',
      data: state
    })
  } catch (error) {
    console.error('tradeResources error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
