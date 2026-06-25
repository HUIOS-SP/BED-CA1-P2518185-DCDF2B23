import { ENEMY_FACTIONS, ENEMIES_PER_CAMPAIGN } from '../constants/gameBalance.js'
import {
  getCampaignDifficultyMultiplier,
  getSafeCampaignNumber
} from './campaignScaling.js'

const ENEMY_TEMPLATES = {
  1: { title: 'Vanguard', baseStrength: 120, weakAgainstUnitType: 'infantry' },
  2: { title: 'Iron Host', baseStrength: 180, weakAgainstUnitType: 'cavalry' },
  3: { title: 'Grand Battery', baseStrength: 260, weakAgainstUnitType: 'artillery' }
}

// A faction is rolled only when a campaign begins, then its key is persisted
export function getRandomFactionKey() {
  const keys = Object.keys(ENEMY_FACTIONS)
  return keys[Math.floor(Math.random() * keys.length)]
}

// Builds a deterministic enemy from progress, so the same inputs create the same enemy with no rerolls
export function generateCurrentEnemy({ campaignNumber, enemySequence, factionKey }) {
  const faction = ENEMY_FACTIONS[factionKey]
  const template = ENEMY_TEMPLATES[enemySequence]

  // Invalid persisted values should fail loudly instead of generating mystery opponents
  // The error includes the unsupported key so the bad stored value is easy to find
  if (!faction) throw new Error(`Unknown enemy faction: ${factionKey}`)
  if (
    !Number.isInteger(enemySequence) ||
    !template ||
    enemySequence < 1 ||
    enemySequence > ENEMIES_PER_CAMPAIGN
  ) {
    throw new Error(`Unknown enemy sequence: ${enemySequence}`)
  }

  const safeCampaignNumber = getSafeCampaignNumber(campaignNumber)
  const difficultyMultiplier = getCampaignDifficultyMultiplier(safeCampaignNumber)

  // No enemy row is stored, this object is generated on demand for endless gameplay
  return {
    enemyArmyId: `generated-c${safeCampaignNumber}-e${enemySequence}-${factionKey}`,
    enemyName: `${faction.name} ${template.title}`,
    factionKey,
    factionName: faction.name,
    enemySequence,
    weakAgainstUnitType: template.weakAgainstUnitType,
    weakAgainstUnit: template.weakAgainstUnitType,
    difficultyMultiplier,
    fightingStrength: Math.round(template.baseStrength * difficultyMultiplier)
  }
}
