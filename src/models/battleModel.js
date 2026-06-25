import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import {
  armies, armyCampaignProgress, armyEquipment, armyLogs, armyResources, armyUnits
} from '../db/schema.js'
import {
  BATTLE_LOW_RESOURCE_MORALE_PENALTY, BATTLE_VICTORY_MORALE_GAIN,
  ENEMIES_PER_CAMPAIGN, STARTING_EQUIPMENT, STARTING_RESOURCES, STARTING_UNITS
} from '../constants/gameBalance.js'
import { clampMorale } from '../utils/turnCalculator.js'
import { generateCurrentEnemy, getRandomFactionKey } from '../utils/enemyGenerator.js'
import { getObjectValueOrDefault } from '../utils/helper.js'
import * as userArmyModel from './userArmyModel.js'

// Converts stored progress into the generated opponent used by both battle entry points
export function findCurrentEnemy(progress) {
  return generateCurrentEnemy({
    campaignNumber: progress.campaignNumber,
    enemySequence: progress.currentEnemySequence,
    factionKey: progress.currentFaction
  })
}

// Applies calculated casualties to each owned unit row
async function applyTroopLosses(tx, troopLosses) {
  for (const loss of troopLosses) {
    await tx.update(armyUnits).set({ quantity: loss.quantityAfter })
      .where(eq(armyUnits.id, loss.armyUnitId))
  }
}

// Defeat resets the army's mutable loadout but preserves endless campaign depth
async function applyDefeat(tx, { army, progress, enemy, battleDetails, battleTurnNumber }) {
  // Reset everything inside the caller's transaction because a half-reset army would be a mess
  await tx.update(armies).set({ updatedAt: new Date() }).where(eq(armies.id, army.id))
  await tx.update(armyResources).set(STARTING_RESOURCES).where(eq(armyResources.armyId, army.id))
  await tx.update(armyEquipment).set(STARTING_EQUIPMENT).where(eq(armyEquipment.armyId, army.id))
  const units = await userArmyModel.findArmyUnitsWithTypes(army.id, tx)
  for (const unit of units) {
    await tx.update(armyUnits)
      .set({ quantity: getObjectValueOrDefault(STARTING_UNITS, unit.unitName, 0) })
      .where(eq(armyUnits.id, unit.armyUnitId))
  }
  const [updatedProgress] = await tx.update(armyCampaignProgress).set({
    currentEnemySequence: 1,
    turnsOnCurrentEnemy: 0,
    updatedAt: new Date()
  }).where(eq(armyCampaignProgress.id, progress.id)).returning()
  await tx.insert(armyLogs).values({
    armyId: army.id,
    turnNumber: battleTurnNumber,
    eventType: 'battle_defeat',
    message: `Defeated by ${enemy.enemyName}. Campaign ${progress.campaignNumber} restarted from enemy 1.`,
    details: battleDetails
  })
  // Return authoritative post-reset values for the action response
  return {
    progress: updatedProgress,
    campaignCompleted: false,
    armyReset: true,
    resources: { ...STARTING_RESOURCES },
    equipment: { ...STARTING_EQUIPMENT }
  }
}

// Victory spends battle resources, grants scaled rewards, applies losses, and advances progress
async function applyVictory(tx, args) {
  const { army, progress, enemy, resources, battleCost, battleDetails, troopLosses, battleTurnNumber } = args
  let moraleChange = BATTLE_VICTORY_MORALE_GAIN
  if (!battleDetails.hasEnoughFlour || !battleDetails.hasEnoughSupply) {
    moraleChange += BATTLE_LOW_RESOURCE_MORALE_PENALTY
  }

  // Rewards scale with the generated enemy, keeping the economy aligned with endless depth
  const rewardMultiplier = enemy.difficultyMultiplier
  const resourceChanges = {
    manpower: resources.manpower + Math.round(10 * rewardMultiplier),
    ducats: resources.ducats + Math.round(40 * rewardMultiplier),
    flour: Math.max(0, resources.flour - battleCost.flour),
    supply: Math.max(0, resources.supply - battleCost.supply) + Math.round(5 * rewardMultiplier),
    morale: clampMorale(resources.morale + moraleChange)
  }
  await tx.update(armyResources).set(resourceChanges).where(eq(armyResources.armyId, army.id))
  await applyTroopLosses(tx, troopLosses)

  // Enemy three wraps the campaign; otherwise progression simply moves to the next enemy
  const campaignCompleted = progress.currentEnemySequence >= ENEMIES_PER_CAMPAIGN
  const nextFaction = campaignCompleted ? getRandomFactionKey() : progress.currentFaction
  const nextCampaignNumber = campaignCompleted ? progress.campaignNumber + 1 : progress.campaignNumber
  const nextEnemySequence = campaignCompleted ? 1 : progress.currentEnemySequence + 1
  const [updatedProgress] = await tx.update(armyCampaignProgress).set({
    campaignNumber: nextCampaignNumber,
    campaignsCompleted: nextCampaignNumber - 1,
    currentEnemySequence: nextEnemySequence,
    currentFaction: nextFaction,
    turnsOnCurrentEnemy: 0,
    updatedAt: new Date()
  }).where(eq(armyCampaignProgress.id, progress.id)).returning()

  await tx.insert(armyLogs).values({
    armyId: army.id, turnNumber: battleTurnNumber, eventType: 'battle_victory',
    message: `Defeated ${enemy.enemyName}.`, details: battleDetails
  })

  if (campaignCompleted) {
    // A completed campaign rolls one new faction, then persists it for stable future reads
    const nextEnemy = generateCurrentEnemy({ campaignNumber: nextCampaignNumber, enemySequence: 1, factionKey: nextFaction })
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: battleTurnNumber, eventType: 'campaign_completed',
      message: `Campaign ${progress.campaignNumber} completed. New campaign ${nextCampaignNumber} begins against the ${nextEnemy.factionName}.`
    })
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: battleTurnNumber, eventType: 'campaign_started',
      message: `Campaign ${nextCampaignNumber} started against the ${nextEnemy.factionName}.`
    })
  } else {
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: battleTurnNumber, eventType: 'enemy_defeated',
      message: `Enemy ${progress.currentEnemySequence} defeated. Enemy ${nextEnemySequence} approaches.`
    })
  }

  return {
    progress: updatedProgress,
    campaignCompleted,
    armyReset: false,
    resources: resourceChanges
  }
}

export async function applyBattleResultInTransaction(tx, args) {
  // Both manual battles and auto-attacks share this outcome switch
  if (args.outcome === 'defeat') return applyDefeat(tx, args)
  if (args.outcome === 'victory') return applyVictory(tx, args)
  throw new Error(`Unsupported battle outcome: ${args.outcome}`)
}

export async function resolveBattle(args) {
  // Manual battles start their own transaction; turn auto-attacks pass an existing one above
  return db.transaction((tx) => applyBattleResultInTransaction(tx, args))
}
