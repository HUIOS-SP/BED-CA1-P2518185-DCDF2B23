import { eq } from 'drizzle-orm'
import { db } from '../db/db.js'
import { users } from '../db/schema.js'
import * as userArmyModel from './userArmyModel.js'

// User model contains only database queries for user profiles.
// Reads all users, optionally filtered by username.
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
    return await query.where(eq(users.username, filters.username))
  }

  return await query
}

// Reads one user by primary key id.
export async function findUserById(userId) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return user
}

// Reads one user by unique username.
export async function findUserByUsername(username) {
  const [user] = await db.select().from(users).where(eq(users.username, username))
  return user
}

// Inserts a new user row.
export async function createUser(data) {
  // SQLite generates the integer id automatically.
  const [user] = await db.insert(users).values({
    username: data.username,
    password: data.password
  }).returning()

  return user
}

// Creates a new user and immediately starts their default game state.
export async function createUserWithStartingArmy(data) {
  // User creation and starter army creation must succeed or fail together.
  const createdGame = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      username: data.username,
      password: data.password
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

  const state = await userArmyModel.findArmyStateByUserId(createdGame.user.id)

  return {
    user: createdGame.user,
    army: createdGame.army,
    state
  }
}

// Updates only the username field for one user.
export async function updateUsername(userId, username) {
  const [user] = await db
    .update(users)
    .set({ username, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  return user
}

// Deletes one user row by id.
export async function deleteUser(userId) {
  const [user] = await db.delete(users).where(eq(users.id, userId)).returning()
  return user
}
