import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { ENEMY_ATTACK_AT_TURN } from '../constants/gameBalance.js'
import { armyCampaignProgress, armyEquipment, armyLogs, armyResources } from '../db/schema.js'
import * as battleModel from './battleModel.js'
import { getValueOrDefault } from '../utils/helper.js'

// Persists one turn and, when required, its automatic battle in the same transaction
export async function advanceTurn({
  army, progress, turnResult, equipmentGain, equipmentRow, turnsOnCurrentEnemy,
  enemyAttackAtTurn = ENEMY_ATTACK_AT_TURN, enemyAttacked, campaign, enemy, battleResolution
}) {
  return db.transaction(async (tx) => {
    // First commit production, upkeep, equipment gain, and the waiting counter
    const [updatedResources] = await tx.update(armyResources)
      .set(turnResult.resources)
      .where(eq(armyResources.armyId, army.id))
      .returning()
    const [updatedEquipment] = await tx.update(armyEquipment).set({
      horses: equipmentRow.horses + equipmentGain.horses,
      fieldGuns: equipmentRow.fieldGuns + equipmentGain.fieldGuns,
      muskets: equipmentRow.muskets + equipmentGain.muskets
    }).where(eq(armyEquipment.armyId, army.id)).returning()
    const [updatedProgress] = await tx.update(armyCampaignProgress).set({
      currentTurn: turnResult.turnNumber, turnsOnCurrentEnemy, updatedAt: new Date()
    }).where(eq(armyCampaignProgress.id, progress.id)).returning()
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: turnResult.turnNumber, eventType: 'turn_advanced',
      message: `Advanced to turn ${turnResult.turnNumber}.`,
      details: {
        campaignMultiplier: turnResult.campaignMultiplier,
        manpowerGained: turnResult.manpowerGained,
        equipmentGained: equipmentGain,
        flourGained: turnResult.flourGained,
        supplyGained: turnResult.supplyGained,
        flourConsumed: turnResult.flourConsumed,
        supplyConsumed: turnResult.supplyConsumed,
        moraleChange: turnResult.moraleChange,
        turnsOnCurrentEnemy, enemyAttackAtTurn, enemyAttacked
      }
    })

    // Most turns end here; no battle work is performed unless the threshold was reached
    if (!enemyAttacked) {
      return {
        enemyAttacked: false,
        battleResult: null,
        resources: updatedResources,
        equipment: updatedEquipment,
        progress: updatedProgress
      }
    }
    // Auto-attacks receive their own log before the shared battle transaction logic runs
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: turnResult.turnNumber, eventType: 'enemy_auto_attack',
      message: `${enemy.enemyName} attacked after ${enemyAttackAtTurn} preparation turns.`
    })
    const battleResult = await battleModel.applyBattleResultInTransaction(tx, {
      army, campaign,
      progress: updatedProgress,
      enemy, resources: updatedResources,
      battleCost: battleResolution.battleCost,
      battleDetails: battleResolution.battleDetails,
      troopLosses: battleResolution.troopLosses,
      outcome: battleResolution.outcome,
      battleTurnNumber: turnResult.turnNumber
    })
    // Defeat supplies reset equipment; victory keeps the turn's updated equipment
    return {
      enemyAttacked: true,
      battleResult,
      resources: battleResult.resources,
      equipment: getValueOrDefault(battleResult.equipment, updatedEquipment),
      progress: battleResult.progress
    }
  })
}
