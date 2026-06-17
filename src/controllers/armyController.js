import { checkAndGetUserIdFromQuery } from '../../helper.js'
import * as armyModel from '../models/armyModel.js'

// Handles admin/debug-style army list reads.
// Reads all armies, optionally filtered by userId query parameter.
export const getArmies = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromQuery(req, res)
    if (userId === null) return

    const filters = {}

    if (userId) {
      filters.userId = userId
    }

    const armies = await armyModel.findAllArmies(filters)

    res.status(200).json({
      message: 'Armies retrieved successfully.',
      data: armies
    })
  } catch (error) {
    console.error('getArmies error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
