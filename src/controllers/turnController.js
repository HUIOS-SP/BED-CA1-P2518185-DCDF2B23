import * as turnModel from '../models/turnModel.js'
import * as battleModel from '../models/battleModel.js'
import * as userArmyModel from '../models/userArmyModel.js'
import { BATTLE_TRIGGER_ENEMY_AUTO_ATTACK, ENEMY_ATTACK_AT_TURN } from '../constants/gameBalance.js'
import { calculateBattleResolution } from '../utils/battleCalculator.js'
import {
  calculateNextTurnsOnCurrentEnemy, calculateEquipmentGain, calculateTurnResult,
  calculateUnitUpkeep, checkIfEnemyShouldAutoAttack
} from '../utils/turnCalculator.js'
import {
  buildBattleResponse,
  toCampaignProgressSummary
} from '../utils/responseFormatter.js'

// Advances production/upkeep and optionally resolves the enemy's automatic attack
export const advanceTurn = async (req, res, next) => {
  try {
    const army = res.locals.army

    // One starting snapshot keeps turn calculations consistent and avoids query ping-pong
    const gameState = await userArmyModel.findArmyGameplayStateByArmyId(army.id)
    const stateError = userArmyModel.getArmyStateError(gameState)
    if (stateError) return res.status(409).json({ error: stateError })
    const { resources, units, equipment: equipmentRow, progress } = gameState
    const campaign = { campaignNumber: progress.campaignNumber, campaignName: `Campaign ${progress.campaignNumber}` }
    const enemy = battleModel.findCurrentEnemy(progress)
    const upkeep = calculateUnitUpkeep(units)
    const equipmentGain = calculateEquipmentGain(progress.campaignNumber)

    // Production is added before upkeep, matching the documented turn order
    const turnResult = calculateTurnResult({
      campaignNumber: progress.campaignNumber, currentTurn: progress.currentTurn,
      resources, upkeep
    })
    const turnsOnCurrentEnemy = calculateNextTurnsOnCurrentEnemy(progress.turnsOnCurrentEnemy)
    const enemyAttacked = checkIfEnemyShouldAutoAttack(turnsOnCurrentEnemy, ENEMY_ATTACK_AT_TURN)

    // Battle math is prepared only when the waiting counter actually reaches the threshold
    const battleResolution = enemyAttacked ? calculateBattleResolution({
      campaign, enemy, resources: turnResult.resources, units,
      trigger: BATTLE_TRIGGER_ENEMY_AUTO_ATTACK, turnsOnCurrentEnemy,
      enemyAttackAtTurn: ENEMY_ATTACK_AT_TURN
    }) : null
    // The model writes the turn and any auto-battle inside one transaction, all or nothing
    const outcome = await turnModel.advanceTurn({
      army, progress, turnResult, equipmentGain, equipmentRow, turnsOnCurrentEnemy,
      enemyAttackAtTurn: ENEMY_ATTACK_AT_TURN, enemyAttacked, campaign, enemy, battleResolution
    })
    // Turn responses report effects and balances without cloning the complete army state
    res.locals.data = {
      turnNumber: turnResult.turnNumber,
      campaignMultiplier: turnResult.campaignMultiplier,
      gained: {
        manpower: turnResult.manpowerGained,
        flour: turnResult.flourGained,
        supply: turnResult.supplyGained,
        equipment: equipmentGain
      },
      consumed: {
        flour: turnResult.flourConsumed,
        supply: turnResult.supplyConsumed
      },
      moraleChange: turnResult.moraleChange,
      resourceBalances: {
        manpower: outcome.resources.manpower,
        ducats: outcome.resources.ducats,
        flour: outcome.resources.flour,
        supply: outcome.resources.supply,
        morale: outcome.resources.morale
      },
      equipmentBalances: {
        horses: outcome.equipment.horses,
        fieldGuns: outcome.equipment.fieldGuns,
        muskets: outcome.equipment.muskets
      },
      enemyAttack: {
        attacked: outcome.enemyAttacked,
        attackAtTurn: ENEMY_ATTACK_AT_TURN,
        turnsOnCurrentEnemy: outcome.progress.turnsOnCurrentEnemy
      },
      campaignProgress: toCampaignProgressSummary(outcome.progress)
    }
    if (outcome.enemyAttacked) {
      // Attach battle details only when a battle really happened; no empty placeholder object
      res.locals.data.battle = buildBattleResponse({
        trigger: BATTLE_TRIGGER_ENEMY_AUTO_ATTACK,
        campaignNumber: progress.campaignNumber,
        enemy,
        resolution: battleResolution,
        result: outcome.battleResult
      })
    }
    next()
  } catch (error) {
    next(error)
  }
}
