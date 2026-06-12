import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { users } from '../db/schema.js'

export const getAllUsers = async () => {
  return await db
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt
    })
    .from(users)
}

export const getUserById = async (id) => {
  const rows = await db.select().from(users).where(eq(users.id, id))
  return rows[0]
}

export const createUser = async (data) => {
  const rows = await db.insert(users).values(data).returning()
  return rows[0]
}

export const updateUsername = async (id, username) => {
  const rows = await db
    .update(users)
    .set({ username })
    .where(eq(users.id, id))
    .returning()

  return rows[0]
}

export const deleteUser = async (id) => {
  const rows = await db.delete(users).where(eq(users.id, id)).returning()
  return rows[0]
}