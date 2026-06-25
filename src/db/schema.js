import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

// Reusable timestamp helper keeps every date column speaking the same dialect
const timestamp = (name) => integer(name, { mode: 'timestamp' })

// Player profile used to identify one army owner in the CA1 API
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date())
})

// Every user receives one army during transactional creation
// unique(user_id) makes the one-user-one-army rule database-enforced, not just good intentions
export const armies = sqliteTable('armies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  armyName: text('army_name').notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date())
})

// One resource wallet per army, with a unique key to make duplicate wallets impossible
export const armyResources = sqliteTable('army_resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().unique().references(() => armies.id, { onDelete: 'cascade' }),
  manpower: integer('manpower').notNull().default(120),
  ducats: integer('ducats').notNull().default(180),
  flour: integer('flour').notNull().default(120),
  supply: integer('supply').notNull().default(100),
  morale: integer('morale').notNull().default(50)
})

// Fixed equipment inventory, since one row is simpler than an extra equipment catalogue for CA1
export const armyEquipment = sqliteTable('army_equipment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().unique().references(() => armies.id, { onDelete: 'cascade' }),
  horses: integer('horses').notNull().default(0),
  fieldGuns: integer('field_guns').notNull().default(0),
  muskets: integer('muskets').notNull().default(0)
})

// Static unit catalog with recruitment, upkeep, and battle cost rules
export const unitTypes = sqliteTable('unit_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  unitName: text('unit_name').notNull().unique(),
  baseStrength: integer('base_strength').notNull(),
  requiredManpower: integer('required_manpower').notNull(),
  requiredEquipment: text('required_equipment').notNull(),
  requiredEquipmentQty: integer('required_equipment_qty').notNull().default(0),
  flourUpkeep: integer('flour_upkeep').notNull(),
  supplyUpkeep: integer('supply_upkeep').notNull(),
  battleSupplyCost: integer('battle_supply_cost').notNull()
})

// Quantity of each recruited unit type owned by an army
// The composite unique key stops duplicate infantry rows from entering the chat
export const armyUnits = sqliteTable('army_units', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().references(() => armies.id, { onDelete: 'cascade' }),
  unitTypeId: integer('unit_type_id').notNull().references(() => unitTypes.id),
  quantity: integer('quantity').notNull().default(0)
}, (table) => [
  unique().on(table.armyId, table.unitTypeId)
])

// Three seeded campaign templates retained as read-only flavour/catalogue data
// Endless gameplay does not join these rows; they are reference content only
export const campaignTemplates = sqliteTable('campaign_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignNumber: integer('campaign_number').notNull().unique(),
  campaignName: text('campaign_name').notNull().unique(),
  enemyNation: text('enemy_nation').notNull(),
  description: text('description'),
  // Reward and production fields stay for reference, but endless balance ignores them
  majorRewardDucats: integer('major_reward_ducats').notNull().default(0),
  majorRewardManpower: integer('major_reward_manpower').notNull().default(0),
  majorRewardSupply: integer('major_reward_supply').notNull().default(0),
  majorRewardMorale: integer('major_reward_morale').notNull().default(0),
  manpowerGainPerTurn: integer('manpower_gain_per_turn').notNull(),
  musketsGainPerTurn: integer('muskets_gain_per_turn').notNull(),
  horsesGainPerTurn: integer('horses_gain_per_turn').notNull(),
  fieldGunsGainPerTurn: integer('field_guns_gain_per_turn').notNull(),
  flourGainPerTurn: integer('flour_gain_per_turn').notNull(),
  supplyGainPerTurn: integer('supply_gain_per_turn').notNull()
})

// Three ordered flavour enemies belong to each seeded campaign template
export const campaignTemplateEnemies = sqliteTable('campaign_template_enemies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignTemplateId: integer('campaign_template_id').notNull().references(() => campaignTemplates.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  enemyName: text('enemy_name').notNull(),
  fightingStrength: integer('fighting_strength').notNull(),
  weakAgainstUnit: text('weak_against_unit').notNull().default('none'),
  // Minor rewards are also read-only metadata: stored, seeded, and kept off the public API
  minorRewardDucats: integer('minor_reward_ducats').notNull().default(0),
  minorRewardManpower: integer('minor_reward_manpower').notNull().default(0),
  minorRewardSupply: integer('minor_reward_supply').notNull().default(0)
}, (table) => [
  unique().on(table.campaignTemplateId, table.sequence)
])

// One row tracks the user's current endless campaign and enemy sequence
// One army, one progress row; no branching timelines today
export const armyCampaignProgress = sqliteTable('army_campaign_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().unique().references(() => armies.id, { onDelete: 'cascade' }),
  campaignNumber: integer('campaign_number').notNull().default(1),
  currentTurn: integer('current_turn').notNull().default(1),
  currentEnemySequence: integer('current_enemy_sequence').notNull().default(1),
  currentFaction: text('current_faction').notNull(),
  campaignsCompleted: integer('campaigns_completed').notNull().default(0),
  turnsOnCurrentEnemy: integer('turns_on_current_enemy').notNull().default(0),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date())
})

// One readable log table records turns, trades, battles, campaign rewards, and resets
export const armyLogs = sqliteTable('army_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().references(() => armies.id, { onDelete: 'cascade' }),
  // Turn when the event happened, with multiple events allowed to share one turn number
  turnNumber: integer('turn_number'),
  // Searchable event category such as turn, recruit, trade, battle, or campaign
  eventType: text('event_type').notNull(),
  message: text('message').notNull(),
  // SQLite stores text; Drizzle handles JSON conversion so models can use normal objects
  details: text('details', { mode: 'json' }),
  createdAt: timestamp('created_at').$defaultFn(() => new Date())
})
