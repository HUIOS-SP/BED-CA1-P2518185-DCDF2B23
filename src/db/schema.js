import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

// Reusable timestamp column helper for created_at and updated_at fields.
const timestamp = (name) => integer(name, { mode: 'timestamp' })

// Player profile. Password is kept for CA2 readiness, not real auth yet.
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date())
})

// Every user receives one army during transactional user creation.
// The unique user_id constraint prevents a user from receiving a second army.
export const armies = sqliteTable('armies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  armyName: text('army_name').notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date())
})

// The unique army_id constraint gives each army exactly one resource row.
export const armyResources = sqliteTable('army_resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().unique().references(() => armies.id, { onDelete: 'cascade' }),
  manpower: integer('manpower').notNull().default(120),
  ducats: integer('ducats').notNull().default(180),
  flour: integer('flour').notNull().default(120),
  supply: integer('supply').notNull().default(100),
  morale: integer('morale').notNull().default(50)
})

// Static equipment catalog. It is used internally for recruitment only.
export const equipmentTypes = sqliteTable('equipment_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  equipmentName: text('equipment_name').notNull().unique(),
  description: text('description')
})

// Quantity of each equipment type owned by an army.
// The FK keeps this normalized; API state joins it to the readable equipment name.
export const armyEquipment = sqliteTable('army_equipment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().references(() => armies.id, { onDelete: 'cascade' }),
  equipmentTypeId: integer('equipment_type_id').notNull().references(() => equipmentTypes.id),
  quantity: integer('quantity').notNull().default(0)
}, (table) => [
  unique().on(table.armyId, table.equipmentTypeId)
])

// Static unit catalog with recruitment, upkeep, and battle cost rules.
export const unitTypes = sqliteTable('unit_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  unitName: text('unit_name').notNull().unique(),
  baseStrength: integer('base_strength').notNull(),
  requiredManpower: integer('required_manpower').notNull(),
  requiredEquipmentTypeId: integer('required_equipment_type_id').notNull().references(() => equipmentTypes.id),
  requiredEquipmentQty: integer('required_equipment_qty').notNull(),
  flourUpkeep: integer('flour_upkeep').notNull(),
  supplyUpkeep: integer('supply_upkeep').notNull(),
  battleSupplyCost: integer('battle_supply_cost').notNull()
})

// Quantity of each recruited unit type owned by an army.
// The FK keeps this normalized; recruitment and API responses use the readable unit name.
export const armyUnits = sqliteTable('army_units', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().references(() => armies.id, { onDelete: 'cascade' }),
  unitTypeId: integer('unit_type_id').notNull().references(() => unitTypes.id),
  quantity: integer('quantity').notNull().default(0)
}, (table) => [
  unique().on(table.armyId, table.unitTypeId)
])

// Three linear campaign records. Rewards are stored here after being seeded from constants.
export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignNumber: integer('campaign_number').notNull().unique(),
  campaignName: text('campaign_name').notNull().unique(),
  enemyNation: text('enemy_nation').notNull(),
  description: text('description'),
  majorRewardDucats: integer('major_reward_ducats').notNull().default(0),
  majorRewardManpower: integer('major_reward_manpower').notNull().default(0),
  majorRewardSupply: integer('major_reward_supply').notNull().default(0),
  majorRewardMorale: integer('major_reward_morale').notNull().default(0),
  // Explicit campaign production values are the sole source for turn gains.
  manpowerGainPerTurn: integer('manpower_gain_per_turn').notNull(),
  musketsGainPerTurn: integer('muskets_gain_per_turn').notNull(),
  horsesGainPerTurn: integer('horses_gain_per_turn').notNull(),
  fieldGunsGainPerTurn: integer('field_guns_gain_per_turn').notNull(),
  flourGainPerTurn: integer('flour_gain_per_turn').notNull(),
  supplyGainPerTurn: integer('supply_gain_per_turn').notNull()
})

// Three ordered enemy armies belong to each campaign.
export const campaignEnemyArmies = sqliteTable('campaign_enemy_armies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  enemyName: text('enemy_name').notNull(),
  fightingStrength: integer('fighting_strength').notNull(),
  weakAgainstUnit: text('weak_against_unit').notNull().default('none'),
  minorRewardDucats: integer('minor_reward_ducats').notNull().default(0),
  minorRewardManpower: integer('minor_reward_manpower').notNull().default(0),
  minorRewardSupply: integer('minor_reward_supply').notNull().default(0)
}, (table) => [
  unique().on(table.campaignId, table.sequence)
])

// One row tracks the user's current linear campaign and enemy sequence.
// The unique army_id constraint gives each army one current progress row.
export const armyCampaignProgress = sqliteTable('army_campaign_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().unique().references(() => armies.id, { onDelete: 'cascade' }),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id),
  // Total turn number for the current game run. It continues across campaigns.
  currentTurn: integer('current_turn').notNull().default(1),
  currentEnemySequence: integer('current_enemy_sequence').notNull().default(1),
  // Counts turns spent waiting against this exact enemy before auto-attack triggers.
  turnsOnCurrentEnemy: integer('turns_on_current_enemy').notNull().default(0),
  // A boolean is clearer than an army status string because completion is the only terminal state.
  gameCompleted: integer('game_completed', { mode: 'boolean' }).notNull().default(false),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date())
})

// One readable log table records turns, trades, battles, campaign rewards, and resets.
export const armyLogs = sqliteTable('army_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  armyId: integer('army_id').notNull().references(() => armies.id, { onDelete: 'cascade' }),
  // Turn when the event happened. Multiple events may share one turn number.
  turnNumber: integer('turn_number'),
  // Searchable event category such as turn, recruit, trade, battle, or campaign.
  eventType: text('event_type').notNull(),
  message: text('message').notNull(),
  // Event-specific values stored as JSON text for readable debugging.
  details: text('details'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date())
})
