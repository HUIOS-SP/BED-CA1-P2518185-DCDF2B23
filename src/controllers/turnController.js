import * as turnModel from '../models/turnModel.js'
import {
  BATTLE_TRIGGER_ENEMY_AUTO_ATTACK,
  ENEMY_ATTACK_AT_TURN
} from '../constants/gameBalance.js'
import {
  calculateBattleResolution
} from '../utils/battleCalculator.js'
import {
  calculateNextTurnsOnCurrentEnemy,
  calculateEquipmentGain,
  calculateTurnResult,
  calculateUnitUpkeep,
  checkIfCampaignProductionIsValid,
  checkIfEnemyShouldAutoAttack
} from '../utils/turnCalculator.js'

// Advances the user's army by one turn and applies upkeep/income.
export const advanceTurn = async (req, res, next) => {
  try {
    // Turn advancement changes several tables, so the model handles it in a transaction.
    const userId = res.locals.userId
    const army = res.locals.army

    const resources = await turnModel.findResourcesByArmyId(army.id)
    const units = await turnModel.findArmyUnitsWithTypes(army.id)
    const equipmentRows = await turnModel.findArmyEquipmentWithTypes(army.id)
    const equipmentTypes = await turnModel.findAllEquipmentTypes()
    const progress = await turnModel.findCampaignProgressByArmyId(army.id)

    if (!progress) {
      return res.status(409).json({ error: 'Army has no campaign progress.' })
    }

    if (progress.gameCompleted) {
      return res.status(409).json({ error: 'All campaigns have already been completed.' })
    }

    const campaign = await turnModel.findCampaignById(progress.campaignId)

    if (!campaign) {
      return res.status(409).json({ error: 'Campaign progress is missing its campaign.' })
    }

    if (!checkIfCampaignProductionIsValid(campaign)) {
      return res.status(409).json({ error: 'Campaign production values are invalid.' })
    }

    const enemy = await turnModel.findEnemyByCampaignAndSequence(
      progress.campaignId,
      progress.currentEnemySequence
    )

    if (!enemy) {
      return res.status(409).json({ error: 'Campaign progress is missing its enemy army.' })
    }

    // The utility functions keep the turn maths separate from HTTP handling.
    const upkeep = calculateUnitUpkeep(units)
    const equipmentGain = calculateEquipmentGain(equipmentTypes, campaign)
    const turnResult = calculateTurnResult({
      campaign,
      currentTurn: progress.currentTurn,
      resources,
      upkeep,
      equipmentGain
    })
    const turnsOnCurrentEnemy = calculateNextTurnsOnCurrentEnemy(progress.turnsOnCurrentEnemy)
    const enemyAttacked = checkIfEnemyShouldAutoAttack(
      turnsOnCurrentEnemy,
      ENEMY_ATTACK_AT_TURN
    )
    let battleResolution = null

    if (enemyAttacked) {
      battleResolution = calculateBattleResolution({
        campaign,
        enemy,
        resources: turnResult.resources,
        units,
        trigger: BATTLE_TRIGGER_ENEMY_AUTO_ATTACK,
        turnsOnCurrentEnemy,
        enemyAttackAtTurn: ENEMY_ATTACK_AT_TURN
      })
    }

    const turnOutcome = await turnModel.advanceTurn({
      army,
      progress,
      turnResult,
      equipmentGain,
      equipmentRows,
      turnsOnCurrentEnemy,
      enemyAttackAtTurn: ENEMY_ATTACK_AT_TURN,
      enemyAttacked,
      campaign,
      enemy,
      battleResolution
    })

    const state = await turnModel.findArmyStateByUserId(userId)
    let turnsOnCurrentEnemyAfterTurn = turnsOnCurrentEnemy

    if (state.campaignProgress) {
      turnsOnCurrentEnemyAfterTurn = state.campaignProgress.turnsOnCurrentEnemy
    }

    res.locals.data = {
      turnAdvanced: true,
      enemyAttacked: turnOutcome.enemyAttacked,
      enemyAttackAtTurn: ENEMY_ATTACK_AT_TURN,
      turnsOnCurrentEnemy: turnsOnCurrentEnemyAfterTurn,
      armyState: state
    }

    if (turnOutcome.enemyAttacked) {
      res.locals.data.battle = {
        trigger: BATTLE_TRIGGER_ENEMY_AUTO_ATTACK,
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
        armyReset: turnOutcome.battleResult.armyReset,
        campaignCompleted: turnOutcome.battleResult.campaignCompleted,
        gameCompleted: turnOutcome.battleResult.gameCompleted
      }
    }

    next()
  } catch (error) {
    console.error('advanceTurn error:', error)
    res.status(500).json({ error: 'Internal Server Error.' })
  }
}
