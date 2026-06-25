import { Router } from 'express'
import * as armyLogController from '../controllers/armyLogController.js'
import * as battleController from '../controllers/battleController.js'
import * as recruitController from '../controllers/recruitController.js'
import * as tradeController from '../controllers/tradeController.js'
import * as turnController from '../controllers/turnController.js'
import * as userArmyController from '../controllers/userArmyController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// Every army endpoint needs the same user -> army lookup chain, keeping it DRY but readable
const loadArmy = [
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy
]

// Army identity and the one full-state read live at the top
router.get(
  '/:userId/army',
  ...loadArmy,
  userArmyController.getUserArmy,
  response.withMessage('Army retrieved successfully.'),
  response.sendResponse
)

router.put(
  '/:userId/army',
  ...loadArmy,
  userArmyController.updateUserArmy,
  response.withMessage('Army updated successfully.'),
  response.sendResponse
)

router.post(
  '/:userId/army/restart',
  ...loadArmy,
  userArmyController.restartUserArmy,
  response.withMessage('Game restarted successfully.'),
  response.sendResponse
)

router.get(
  '/:userId/army/state',
  ...loadArmy,
  userArmyController.getUserArmyState,
  response.withMessage('Army state retrieved successfully.'),
  response.sendResponse
)

// Gameplay mutations return focused action results, not the whole army state every time
router.post(
  '/:userId/army/recruit',
  ...loadArmy,
  recruitController.recruitUnits,
  response.withMessage('Units recruited successfully.'),
  response.sendResponse
)

router.post(
  '/:userId/army/trade',
  ...loadArmy,
  tradeController.tradeResources,
  response.withMessage('Trade completed successfully.'),
  response.sendResponse
)

// Turn messages depend on whether the waiting enemy finally chose violence
router.post(
  '/:userId/army/advance-turn',
  ...loadArmy,
  turnController.advanceTurn,
  response.withDynamicMessage((req, res) => {
    if (res.locals.data.enemyAttack.attacked) {
      return 'Turn advanced. The enemy attacked first.'
    }

    return 'Turn advanced successfully.'
  }),
  response.sendResponse
)

// Battles and logs round out the gameplay routes without needing more route files
router.post(
  '/:userId/army/battle',
  ...loadArmy,
  battleController.resolveBattle,
  response.withMessage('Battle resolved successfully.'),
  response.sendResponse
)

router.get(
  '/:userId/army/logs',
  ...loadArmy,
  armyLogController.getArmyLogs,
  response.withMessage('Army logs retrieved successfully.'),
  response.sendResponse
)

export default router
