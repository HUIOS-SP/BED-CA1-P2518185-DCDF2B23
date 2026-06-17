import { checkAndGetUserIdFromParams } from '../../helper.js'
import * as battleModel from '../models/battleModel.js'
import {
  calculateBattleResourceCost,
  calculatePlayerFightingStrength,
  determineBattleOutcome
} from '../utils/battleCalculator.js'

// Finds the user and army before battle routes touch campaign data.
async function findUserAndArmy(userId) {
  const user = await battleModel.findUserById(userId)

  if (!user) {
    return { errorStatus: 404, error: 'User not found.' }
  }

  const army = await battleModel.findArmyByUserId(userId)

  if (!army) {
    return { errorStatus: 404, error: 'Army not found for this user.' }
  }

  return { user, army }
}

// Resolves one battle against the next enemy in the linear campaign path.
export const resolveBattle = async (req, res) => {
  try {
    const userId = checkAndGetUserIdFromParams(req, res)
    if (!userId) return

    const result = await findUserAndArmy(userId)

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error })
    }

    if (result.army.status === 'completed') {
      return res.status(409).json({ error: 'All campaigns have already been completed.' })
    }

    const progress = await battleModel.findCampaignProgressByArmyId(result.army.id)

    if (!progress) {
      return res.status(409).json({ error: 'Army has no campaign progress.' })
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

    const resources = await battleModel.findResourcesByArmyId(result.army.id)
    const units = await battleModel.findArmyUnitsWithTypes(result.army.id)
    const battleCost = calculateBattleResourceCost(units)
    const hasEnoughFlour = resources.flour >= battleCost.flour
    const hasEnoughSupply = resources.supply >= battleCost.supply
    const playerStrength = calculatePlayerFightingStrength({
      units,
      morale: resources.morale,
      hasEnoughFlour,
      hasEnoughSupply,
      weakAgainstUnit: enemy.weakAgainstUnit
    })
    const outcome = determineBattleOutcome(
      playerStrength.fightingStrength,
      enemy.fightingStrength
    )

    const battleDetails = {
      campaignName: campaign.campaignName,
      enemyName: enemy.enemyName,
      enemyFightingStrength: enemy.fightingStrength,
      weakAgainstUnit: enemy.weakAgainstUnit,
      playerFightingStrength: playerStrength.fightingStrength,
      playerBaseStrength: playerStrength.baseStrength,
      moraleMultiplier: playerStrength.moraleMultiplier,
      counterMultiplier: playerStrength.counterMultiplier,
      resourceMultiplier: playerStrength.resourceMultiplier,
      hasCounterUnit: playerStrength.hasCounterUnit,
      flourNeeded: battleCost.flour,
      supplyNeeded: battleCost.supply,
      hasEnoughFlour,
      hasEnoughSupply,
      outcome
    }

    const battleResult = await battleModel.resolveBattle({
      army: result.army,
      campaign,
      progress,
      enemy,
      resources,
      battleCost,
      battleDetails,
      outcome
    })
    const state = await battleModel.findArmyStateByUserId(userId)

    res.status(200).json({
      message: 'Battle resolved successfully.',
      data: {
        outcome,
        enemyName: enemy.enemyName,
        campaignName: campaign.campaignName,
        playerFightingStrength: playerStrength.fightingStrength,
        enemyFightingStrength: enemy.fightingStrength,
        hasCounterUnit: playerStrength.hasCounterUnit,
        counterMultiplier: playerStrength.counterMultiplier,
        resourceMultiplier: playerStrength.resourceMultiplier,
        armyReset: battleResult.armyReset,
        campaignCompleted: battleResult.campaignCompleted,
        gameCompleted: battleResult.gameCompleted,
        campaignProgress: state.campaignProgress,
        armyState: state
      }
    })
  } catch (error) {
    console.error('resolveBattle error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
