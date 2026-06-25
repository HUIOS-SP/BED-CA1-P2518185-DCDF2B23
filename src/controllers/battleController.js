import * as battleModel from '../models/battleModel.js'
import * as userArmyModel from '../models/userArmyModel.js'
import { getRequestBody } from '../utils/helper.js'
import { BATTLE_TRIGGER_MANUAL } from '../constants/gameBalance.js'
import { calculateBattleResolution } from '../utils/battleCalculator.js'
import { buildBattleResponse } from '../utils/responseFormatter.js'

// Resolves a manual battle against the enemy generated from persisted campaign progress
export const resolveBattle = async (req, res, next) => {
  try {
    const army = res.locals.army

    // Clients cannot cherry-pick an easy enemy; campaign progress chooses the opponent
    if (getRequestBody(req).enemyArmyId !== undefined) {
      return res.status(400).json({ error: 'enemyArmyId is not allowed. Battle uses the current campaign enemy.' })
    }

    // Read the gameplay snapshot once so every calculation uses the same starting state
    const gameState = await userArmyModel.findArmyGameplayStateByArmyId(army.id)
    const stateError = userArmyModel.getArmyStateError(gameState)
    if (stateError) return res.status(409).json({ error: stateError })
    const { progress, resources, units } = gameState

    const campaign = { campaignNumber: progress.campaignNumber, campaignName: `Campaign ${progress.campaignNumber}` }
    const enemy = battleModel.findCurrentEnemy(progress)

    // Calculators decide the result, then the model applies it transactionally for a clean hand-off
    const resolution = calculateBattleResolution({ campaign, enemy, resources, units, trigger: BATTLE_TRIGGER_MANUAL })
    const result = await battleModel.resolveBattle({
      army, campaign, progress, enemy, resources,
      battleCost: resolution.battleCost, battleDetails: resolution.battleDetails,
      troopLosses: resolution.troopLosses, outcome: resolution.outcome,
      battleTurnNumber: progress.currentTurn
    })
    // Send the useful battle result, not a surprise full-state data dump
    res.locals.data = buildBattleResponse({
      trigger: BATTLE_TRIGGER_MANUAL,
      campaignNumber: progress.campaignNumber,
      enemy,
      resolution,
      result
    })
    next()
  } catch (error) {
    next(error)
  }
}
