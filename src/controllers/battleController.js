import * as battleModel from '../models/battleModel.js'
import { getRequestBody } from '../utils/helper.js'
import {
  BATTLE_TRIGGER_MANUAL
} from '../constants/gameBalance.js'
import {
  calculateBattleResolution
} from '../utils/battleCalculator.js'

// Resolves one battle against the next enemy in the linear campaign path.
export const resolveBattle = async (req, res, next) => {
  try {
    const userId = res.locals.userId
    const army = res.locals.army
    const requestBody = getRequestBody(req)

    // Manual battle always uses campaign progress, never a client-selected enemy id.
    if (requestBody.enemyArmyId !== undefined) {
      return res.status(400).json({
        error: 'enemyArmyId is not allowed. Battle uses the current campaign enemy.'
      })
    }

    const progress = await battleModel.findCampaignProgressByArmyId(army.id)

    if (!progress) {
      return res.status(409).json({ error: 'Army has no campaign progress.' })
    }

    if (progress.gameCompleted) {
      return res.status(409).json({ error: 'All campaigns have already been completed.' })
    }

    const campaign = await battleModel.findCampaignById(progress.campaignId)

    if (!campaign) {
      return res.status(409).json({ error: 'Campaign progress is missing its campaign.' })
    }

    const enemy = await battleModel.findEnemyByCampaignAndSequence(
      progress.campaignId,
      progress.currentEnemySequence
    )

    if (!enemy) {
      return res.status(409).json({ error: 'Campaign progress is missing its enemy army.' })
    }

    // Battle math uses the current army state at the moment the player presses fight.
    const resources = await battleModel.findResourcesByArmyId(army.id)
    const units = await battleModel.findArmyUnitsWithTypes(army.id)
    const battleResolution = calculateBattleResolution({
      campaign,
      enemy,
      resources,
      units,
      trigger: BATTLE_TRIGGER_MANUAL
    })

    const battleResult = await battleModel.resolveBattle({
      army,
      campaign,
      progress,
      enemy,
      resources,
      battleCost: battleResolution.battleCost,
      battleDetails: battleResolution.battleDetails,
      troopLosses: battleResolution.troopLosses,
      outcome: battleResolution.outcome
    })
    const state = await battleModel.findArmyStateByUserId(userId)

    res.locals.data = {
      outcome: battleResolution.outcome,
      enemyName: enemy.enemyName,
      campaignName: campaign.campaignName,
      playerFightingStrength: battleResolution.playerStrength.fightingStrength,
      enemyFightingStrength: enemy.fightingStrength,
      victoryType: battleResolution.victoryType,
      hasCounterUnit: battleResolution.playerStrength.hasCounterUnit,
      counterMultiplier: battleResolution.playerStrength.counterMultiplier,
      resourceMultiplier: battleResolution.playerStrength.resourceMultiplier,
      troopLosses: battleResolution.troopLosses,
      armyReset: battleResult.armyReset,
      campaignCompleted: battleResult.campaignCompleted,
      gameCompleted: battleResult.gameCompleted,
      campaignProgress: state.campaignProgress,
      armyState: state
    }
    next()
  } catch (error) {
    console.error('resolveBattle error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
