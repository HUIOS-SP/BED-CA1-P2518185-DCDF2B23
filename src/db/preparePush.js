import 'dotenv/config'
import { createClient } from '@libsql/client'

// Drizzle push recreates named indexes when the schema changes.
// Dropping only our schema-managed indexes first keeps npm run db repeatable.
const client = createClient({
  url: process.env.DATABASE_URL
})

const schemaManagedIndexes = [
  'users_username_unique',
  'armies_user_id_unique',
  'army_resources_army_id_unique',
  'equipment_types_equipment_name_unique',
  'army_equipment_army_id_equipment_type_id_unique',
  'unit_types_unit_name_unique',
  'army_units_army_id_unit_type_id_unique',
  'campaigns_campaign_number_unique',
  'campaigns_campaign_name_unique',
  'campaign_enemy_armies_campaign_id_sequence_unique',
  'army_campaign_progress_army_id_unique'
]

// Drop indexes one by one so SQLite can ignore indexes that do not exist yet.
for (const indexName of schemaManagedIndexes) {
  await client.execute(`DROP INDEX IF EXISTS ${indexName}`)
}

console.log('Prepared database indexes for drizzle push.')
