import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { armies, armyLogs, users } from '../db/schema.js'

// Army log model owns read-only history queries for the single army_log table.
// Reads one user before log routes.
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

// Reads the one army owned by a user.
export async function findArmyByUserId(userId) {
  const [army] = await db.select().from(armies).where(eq(armies.userId, userId))
  return army
}

// Reads generic army log rows with optional eventType and limit filters.
export async function findArmyLogsByArmyId(armyId, filters = {}) {
  let query = db
    .select()
    .from(armyLogs)
    .where(eq(armyLogs.armyId, armyId))
    .orderBy(desc(armyLogs.createdAt))

  if (filters.eventType) {
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
    query = query.limit(filters.limit)
  }

  return await query
}
