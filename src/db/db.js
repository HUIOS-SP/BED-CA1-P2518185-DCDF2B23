import 'dotenv/config'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema.js'

// One shared database client keeps model access consistent across the app
const client = createClient({
  url: process.env.DATABASE_URL
})

export const db = drizzle(client, { schema })
