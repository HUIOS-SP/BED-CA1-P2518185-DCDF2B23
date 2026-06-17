// Game balance constants live here so controllers do not contain magic numbers.

// Starting resources given to every newly created or reset army.
export const STARTING_RESOURCES = {
  manpower: 120,
  ducats: 180,
  flour: 120,
  supply: 100,
  morale: 50
}

// Starting equipment rows created for every new or reset army.
export const STARTING_EQUIPMENT = {
  muskets: 80,
  horses: 25,
  field_guns: 8
}

// Starting unit quantities created for every new or reset army.
export const STARTING_UNITS = {
  infantry: 0,
  cavalry: 0,
  artillery: 0
}

// Unit names that the player can recruit.
export const VALID_UNIT_NAMES = ['infantry', 'cavalry', 'artillery']

// Enemy weakness values allowed in campaign enemy data.
export const VALID_WEAKNESSES = ['none', 'infantry', 'cavalry', 'artillery']

// Static equipment catalog used by seed.js.
export const EQUIPMENT_TYPES = [
  { equipmentName: 'muskets', description: 'Standard firearms used by infantry.' },
  { equipmentName: 'horses', description: 'Mounts required to recruit cavalry.' },
  { equipmentName: 'field_guns', description: 'Heavy guns required to recruit artillery.' }
]

// Static unit catalog used by seed.js.
export const UNIT_TYPES = [
  {
    unitName: 'infantry',
    baseStrength: 10,
    requiredManpower: 10,
    requiredEquipmentName: 'muskets',
    requiredEquipmentQty: 10,
    flourUpkeep: 3,
    supplyUpkeep: 1,
    battleSupplyCost: 1
  },
  {
    unitName: 'cavalry',
    baseStrength: 18,
    requiredManpower: 15,
    requiredEquipmentName: 'horses',
    requiredEquipmentQty: 5,
    flourUpkeep: 3,
    supplyUpkeep: 1,
    battleSupplyCost: 1
  },
  {
    unitName: 'artillery',
    baseStrength: 28,
    requiredManpower: 20,
    requiredEquipmentName: 'field_guns',
    requiredEquipmentQty: 2,
    flourUpkeep: 1,
    supplyUpkeep: 2,
    battleSupplyCost: 3
  }
]

// Camp follower prices for buying and selling resources.
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

// Campaign progression is intentionally linear
export const FIRST_CAMPAIGN_NUMBER = 1
export const FINAL_CAMPAIGN_NUMBER = 3
export const ENEMIES_PER_CAMPAIGN = 3
export const ENEMY_ATTACK_AT_TURN = 6

// Battle multipliers kept here so game balance can be tweaked without route edits.
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

// Morale is clamped so it never goes below 0 or above 100.
export const MORALE_MIN = 0
export const MORALE_MAX = 100
export const LOW_FLOUR_MORALE_PENALTY = -5

// Static campaign and enemy data used by seed.js.
export const CAMPAIGNS = [
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
