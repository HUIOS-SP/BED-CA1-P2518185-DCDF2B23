import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Drizzle Kit reads this during npm run db: schema path in, SQLite updates out
export default defineConfig({
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
})
