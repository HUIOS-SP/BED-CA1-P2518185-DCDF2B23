import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Drizzle Kit reads this file when npm run db pushes schema changes.
export default defineConfig({
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
})
