import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { users } from '../db/schema.js'
import * as userArmyModel from './userArmyModel.js'

// User model contains only database queries for user profiles
// Reads all users, optionally filtered by username
export async function findAllUsers(filters = {}) {
  const query = db
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(users)

  if (filters.username) {
    return query.where(eq(users.username, filters.username))
  }

  return query
}

// Reads one user by primary key id
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

// Reads one user by unique username
export async function findUserByUsername(username) {
  const [user] = await db.select().from(users).where(eq(users.username, username))
  return user
}

// Creates a new user and immediately starts their default game state
export async function createUserWithStartingArmy(data) {
  // User and starter army succeed or fail together, avoiding an orphan profile side quest
  const createdGame = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      username: data.username
    }).returning()

    const army = await userArmyModel.createArmyForUserInTransaction(
      tx,
      user.id,
      data.armyName
    )

    return {
      user,
      army
    }
  })

  return createdGame
}

// Updates only the username field for one user
export async function updateUsername(userId, username) {
  const [user] = await db
    .update(users)
    .set({ username, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  return user
}

// Deletes one user row by id.. yeah
export async function deleteUser(userId) {
  const [user] = await db.delete(users).where(eq(users.id, userId)).returning()
  return user
}
