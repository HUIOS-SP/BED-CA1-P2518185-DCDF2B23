import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { armyLogs, armyResources } from '../db/schema.js'

// Applies the balance change and journal entry together so the history never lies
export async function tradeResources(army, currentTurn, resourceChanges, tradeData) {
  return db.transaction(async (tx) => {
    const [updatedResources] = await tx.update(armyResources)
      .set(resourceChanges)
      .where(eq(armyResources.armyId, army.id))
      .returning()
    // One small wording choice keeps the player-facing log readable
    const verb = tradeData.tradeType === 'sell' ? 'Sold' : 'Bought'
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: currentTurn, eventType: 'trade',
      message: `${verb} ${tradeData.quantity} ${tradeData.item}.`,
      details: tradeData
    })

    return {
      tradeType: tradeData.tradeType,
      item: tradeData.item,
      quantity: tradeData.quantity,
      // Buying is negative and selling is positive; absolute value keeps unit price positive
      pricePerUnit: Math.abs(tradeData.ducatsChange) / tradeData.quantity,
      ducatsChange: tradeData.ducatsChange,
      balances: {
        ducats: updatedResources.ducats,
        // Dynamic key means the response says flour or supply based on the actual trade
        [tradeData.item]: updatedResources[tradeData.item]
      }
    }
  })
}
