import { db } from '../db/db.js'
import { armies } from '../db/schema.js'

export const getAllArmies = async () => {
  return await db.select().from(armies)
}