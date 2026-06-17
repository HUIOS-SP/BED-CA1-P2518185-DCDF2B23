import 'dotenv/config'
import { createClient } from '@libsql/client'

// These indexes enforce the business rules shown in the DBML.
// They live here because drizzle-kit push can collide with old SQLite indexes.
const client = createClient({
  url: process.env.DATABASE_URL
})

const indexStatements = [
  'CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username)',
  'CREATE UNIQUE INDEX IF NOT EXISTS armies_user_id_unique ON armies (user_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS army_resources_army_id_unique ON army_resources (army_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS equipment_types_equipment_name_unique ON equipment_types (equipment_name)',
  'CREATE UNIQUE INDEX IF NOT EXISTS army_equipment_army_id_equipment_type_id_unique ON army_equipment (army_id, equipment_type_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS unit_types_unit_name_unique ON unit_types (unit_name)',
  'CREATE UNIQUE INDEX IF NOT EXISTS army_units_army_id_unit_type_id_unique ON army_units (army_id, unit_type_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS campaigns_campaign_number_unique ON campaigns (campaign_number)',
  'CREATE UNIQUE INDEX IF NOT EXISTS campaigns_campaign_name_unique ON campaigns (campaign_name)',
  'CREATE UNIQUE INDEX IF NOT EXISTS campaign_enemy_armies_campaign_id_sequence_unique ON campaign_enemy_armies (campaign_id, sequence)',
  'CREATE UNIQUE INDEX IF NOT EXISTS army_campaign_progress_army_id_unique ON army_campaign_progress (army_id)'
]

// Each statement is idempotent so npm run db can be repeated safely.
for (const statement of indexStatements) {
  await client.execute(statement)
}

console.log('Ensured database unique indexes.')
