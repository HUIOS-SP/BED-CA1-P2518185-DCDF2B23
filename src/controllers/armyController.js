import * as armyModel from '../models/armyModel.js'

export const getArmies = async (req, res) => {
  try {
    const armies = await armyModel.getAllArmies()

    res.status(200).json({
      message: 'Armies retrieved successfully.',
      data: armies
    })
  } catch (error) {
    console.error('getArmies error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}