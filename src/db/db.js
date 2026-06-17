import 'dotenv/config'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema.js'

// Runtime database client used by all model files.
const client = createClient({
  url: process.env.DATABASE_URL
})

// Drizzle wraps the SQLite/libSQL client and exposes query helpers.
export const db = drizzle(client, { schema })
