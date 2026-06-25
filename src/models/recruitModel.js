import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { armyEquipment, armyLogs, armyResources, armyUnits, unitTypes } from '../db/schema.js'
import { getEquipmentColumnKey } from '../utils/equipment.js'

// Reads unit rules by their public name, such as infantry or artillery
export async function findUnitTypeByName(unitName) {
  const [unitType] = await db.select().from(unitTypes).where(eq(unitTypes.unitName, unitName))
  return unitType
}

// Spends recruitment costs, adds units, and records the action as one transaction
export async function recruitUnits({
  army, resources, equipment, equipmentKey, armyUnit, unitType,
  manpowerCost, equipmentCost, quantity, currentTurn
}) {
  // Re-check the dynamic equipment key at the model boundary before it reaches an update
  if (getEquipmentColumnKey(unitType.requiredEquipment) !== equipmentKey) {
    throw new Error('Invalid equipment requirement.')
  }
  return db.transaction(async (tx) => {
    // These three writes are a package deal, so nobody pays for units that never arrive
    const [updatedResources] = await tx.update(armyResources)
      .set({ manpower: resources.manpower - manpowerCost })
      .where(eq(armyResources.armyId, army.id))
      .returning()
    const [updatedEquipment] = await tx.update(armyEquipment)
      .set({ [equipmentKey]: equipment[equipmentKey] - equipmentCost })
      .where(eq(armyEquipment.armyId, army.id))
      .returning()
    const [updatedUnit] = await tx.update(armyUnits)
      .set({ quantity: armyUnit.quantity + quantity })
      .where(eq(armyUnits.id, armyUnit.armyUnitId))
      .returning()
    await tx.insert(armyLogs).values({
      armyId: army.id, turnNumber: currentTurn, eventType: 'recruit',
      message: `Recruited ${quantity} ${unitType.unitName}.`,
      details: {
        unitName: unitType.unitName,
        quantity,
        manpowerCost,
        equipmentCost,
        equipment: unitType.requiredEquipment
      }
    })

    // Return only what changed so the controller can keep the response focused
    return {
      recruited: {
        unitName: unitType.unitName,
        quantity,
        totalQuantity: updatedUnit.quantity
      },
      spent: {
        manpower: manpowerCost,
        equipment: {
          type: unitType.requiredEquipment,
          quantity: equipmentCost
        }
      },
      remaining: {
        manpower: updatedResources.manpower,
        equipment: {
          type: unitType.requiredEquipment,
          quantity: updatedEquipment[equipmentKey]
        }
      }
    }
  })
}
