import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { armyLogs } from '../db/schema.js'

// Army log model owns read-only history queries for the single army_log table
// Reads generic army log rows with optional eventType and limit filters
export async function findArmyLogsByArmyId(armyId, filters = {}) {
  let query = db
    .select()
    .from(armyLogs)
    .where(eq(armyLogs.armyId, armyId))
    .orderBy(desc(armyLogs.createdAt))

  if (filters.eventType) {
    // Rebuild the query with the extra condition; Drizzle queries stay explicit and readable
    query = db
      .select()
      .from(armyLogs)
      .where(and(
        eq(armyLogs.armyId, armyId),
        eq(armyLogs.eventType, filters.eventType)
      ))
      .orderBy(desc(armyLogs.createdAt))
  }

  if (filters.limit) {
    // Apply the limit last so filtering still happens before the result is capped
    query = query.limit(filters.limit)
  }

  return query
}
