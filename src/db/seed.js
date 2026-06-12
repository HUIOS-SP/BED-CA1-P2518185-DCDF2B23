import { db } from './db.js'
import { users, armies } from './schema.js'

export async function seedDatabase() {
  const existingUsers = await db.select().from(users)

  if (existingUsers.length === 0) {
    const [user] = await db.insert(users).values({
      username: 'player',
      password: 'password123'
    }).returning()

    await db.insert(armies).values({
      userId: user.id,
      name: 'First Army'
    })

    console.log('Seeded player and first army')
  } else {
    // spent way too long thinking about this
    console.log('Seed skipped: users already exist')
  }
}

seedDatabase().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})