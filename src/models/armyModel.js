import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { armies } from '../db/schema.js'

// Army model supports the admin/debug army listing route.
// Reads all armies, optionally filtered by userId.
export async function findAllArmies(filters = {}) {
  const query = db.select().from(armies)

  if (filters.userId) {
    return await query.where(eq(armies.userId, filters.userId))
  }

  return await query
}
