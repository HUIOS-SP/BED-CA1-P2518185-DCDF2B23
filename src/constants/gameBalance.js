// Game balance constants live here so controllers do not contain magic numbers

// Starting resources given to every newly created or reset army
export const STARTING_RESOURCES = {
  manpower: 120,
  ducats: 180,
  flour: 120,
  supply: 100,
  morale: 50
}

// Starting equipment stored in the army's single equipment row
export const STARTING_EQUIPMENT = {
  muskets: 80,
  horses: 25,
  fieldGuns: 8
}

// Universal endless-mode production, while seeded template production is reference metadata only
export const BASE_RESOURCE_GAIN_PER_TURN = {
  manpower: 25,
  flour: 13,
  supply: 14
}

export const BASE_EQUIPMENT_GAIN_PER_TURN = {
  muskets: 8,
  horses: 3,
  fieldGuns: 2
}

// Starting unit quantities created for every new or reset army
export const STARTING_UNITS = {
  infantry: 0,
  cavalry: 0,
  artillery: 0
}

// Enemy weakness values allowed in campaign enemy data
export const VALID_WEAKNESSES = ['none', 'infantry', 'cavalry', 'artillery']

// Static unit catalog used by seed.js
export const UNIT_TYPES = [
  {
    unitName: 'infantry',
    baseStrength: 10,
    requiredManpower: 10,
    requiredEquipment: 'muskets',
    requiredEquipmentQty: 10,
    flourUpkeep: 3,
    supplyUpkeep: 1,
    battleSupplyCost: 1
  },
  {
    unitName: 'cavalry',
    baseStrength: 18,
    requiredManpower: 15,
    requiredEquipment: 'horses',
    requiredEquipmentQty: 5,
    flourUpkeep: 3,
    supplyUpkeep: 1,
    battleSupplyCost: 1
  },
  {
    unitName: 'artillery',
    baseStrength: 28,
    requiredManpower: 20,
    requiredEquipment: 'field_guns',
    requiredEquipmentQty: 2,
    flourUpkeep: 1,
    supplyUpkeep: 2,
    battleSupplyCost: 3
  }
]

// Camp-follower prices deliberately use a spread, so buying and reselling is not free money
export const TRADE_PRICES = {
  flour: {
    buy: 2,
    sell: 1
  },
  supply: {
    buy: 3,
    sell: 1
  }
}

// Endless campaigns contain three enemies each
export const ENEMIES_PER_CAMPAIGN = 3
export const ENEMY_ATTACK_AT_TURN = 6

export const ENEMY_FACTIONS = {
  liho: { key: 'liho', name: 'Duchy of Liho' },
  koi: { key: 'koi', name: 'Koi Konfederacy' },
  bingxue: { key: 'bingxue', name: 'Bingxue Commonwealth' }
}

// Battle tuning lives together here, making balance changes a one-stop shop
export const BATTLE_COUNTER_MULTIPLIER = 1.1
export const BATTLE_NO_COUNTER_MULTIPLIER = 1
export const BATTLE_FULL_RESOURCE_MULTIPLIER = 1
export const BATTLE_LOW_RESOURCE_MULTIPLIER = 0.85
export const BATTLE_TRIGGER_MANUAL = 'manual'
export const BATTLE_TRIGGER_ENEMY_AUTO_ATTACK = 'enemy_auto_attack'
export const BATTLE_VICTORY_MORALE_GAIN = 2
export const BATTLE_LOW_RESOURCE_MORALE_PENALTY = -5
export const VICTORY_TYPE_PYRRHIC = 'pyrrhic'
export const VICTORY_TYPE_STANDARD = 'standard'
export const VICTORY_TYPE_DECISIVE = 'decisive'
export const BATTLE_PYRRHIC_VICTORY_MAX_RATIO = 1.1
export const BATTLE_DECISIVE_VICTORY_MIN_RATIO = 1.5
export const BATTLE_PYRRHIC_VICTORY_TROOP_LOSS_RATE = 0.2
export const BATTLE_STANDARD_VICTORY_TROOP_LOSS_RATE = 0.1
export const BATTLE_DECISIVE_VICTORY_TROOP_LOSS_RATE = 0.05

// Morale is clamped so it never goes below 0 or above 100
export const MORALE_MIN = 0
export const MORALE_MAX = 100
export const LOW_FLOUR_MORALE_PENALTY = -5

// Static campaign-template and enemy data used by seed.js
export const CAMPAIGN_TEMPLATES = [
  {
    campaignNumber: 1,
    campaignName: 'Unix Wars',
    enemyNation: 'Duchy of Liho',
    description: 'The opening border war against Liho fortifications.',
    manpowerGainPerTurn: 25,
    musketsGainPerTurn: 8,
    horsesGainPerTurn: 3,
    fieldGunsGainPerTurn: 2,
    flourGainPerTurn: 13,
    supplyGainPerTurn: 14,
    majorReward: {
      ducats: 120,
      manpower: 50,
      supply: 30,
      morale: 5
    },
    enemies: [
      {
        sequence: 1,
        enemyName: 'Liho Border Guard',
        fightingStrength: 75,
        weakAgainstUnit: 'artillery',
        minorReward: { ducats: 40, manpower: 10, supply: 5 }
      },
      {
        sequence: 2,
        enemyName: 'Liho Pike Regiment',
        fightingStrength: 120,
        weakAgainstUnit: 'cavalry',
        minorReward: { ducats: 55, manpower: 15, supply: 10 }
      },
      {
        sequence: 3,
        enemyName: 'Liho Grand Battery',
        fightingStrength: 175,
        weakAgainstUnit: 'infantry',
        minorReward: { ducats: 70, manpower: 20, supply: 15 }
      }
    ]
  },
  {
    campaignNumber: 2,
    campaignName: 'Conquest of Wayland',
    enemyNation: 'Koi Konfederacy',
    description: 'A push into Wayland against Koi field armies.',
    manpowerGainPerTurn: 25,
    musketsGainPerTurn: 7,
    horsesGainPerTurn: 3,
    fieldGunsGainPerTurn: 1,
    flourGainPerTurn: 10,
    supplyGainPerTurn: 12,
    majorReward: {
      ducats: 180,
      manpower: 75,
      supply: 45,
      morale: 7
    },
    enemies: [
      {
        sequence: 1,
        enemyName: 'Wayland Militia',
        fightingStrength: 170,
        weakAgainstUnit: 'artillery',
        minorReward: { ducats: 65, manpower: 20, supply: 15 }
      },
      {
        sequence: 2,
        enemyName: 'Wayland Cavalry Wing',
        fightingStrength: 230,
        weakAgainstUnit: 'infantry',
        minorReward: { ducats: 95, manpower: 25, supply: 20 }
      },
      {
        sequence: 3,
        enemyName: "Wayland Duke's Guard",
        fightingStrength: 300,
        weakAgainstUnit: 'cavalry',
        minorReward: { ducats: 105, manpower: 30, supply: 25 }
      }
    ]
  },
  {
    campaignNumber: 3,
    campaignName: 'War of the Daemons',
    enemyNation: 'Bingxue Commonwealth',
    description: 'The final war against the Commonwealth daemon engine armies.',
    manpowerGainPerTurn: 30,
    musketsGainPerTurn: 9,
    horsesGainPerTurn: 4,
    fieldGunsGainPerTurn: 2,
    flourGainPerTurn: 10,
    supplyGainPerTurn: 8,
    majorReward: {
      ducats: 260,
      manpower: 100,
      supply: 70,
      morale: 10
    },
    enemies: [
      {
        sequence: 1,
        enemyName: 'Frostline Scouts',
        fightingStrength: 280,
        weakAgainstUnit: 'cavalry',
        minorReward: { ducats: 90, manpower: 30, supply: 25 }
      },
      {
        sequence: 2,
        enemyName: 'Commonwealth Fusiliers',
        fightingStrength: 360,
        weakAgainstUnit: 'artillery',
        minorReward: { ducats: 120, manpower: 40, supply: 30 }
      },
      {
        sequence: 3,
        enemyName: 'Daemon Engine Corps',
        fightingStrength: 470,
        weakAgainstUnit: 'infantry',
        minorReward: { ducats: 160, manpower: 50, supply: 40 }
      }
    ]
  }
]
