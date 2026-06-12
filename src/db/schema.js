import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
})

export const armies = sqliteTable('armies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  manpower: integer('manpower').notNull().default(100),
  ducats: integer('ducats').notNull().default(50),
  flour: integer('flour').notNull().default(30),
  supply: integer('supply').notNull().default(30),
  morale: integer('morale').notNull().default(70)
})