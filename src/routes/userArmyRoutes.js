import { Router } from 'express'
import * as userArmyController from '../controllers/userArmyController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// GET /users/:userId/army
// URL input: userId
// Body input: none
router.get(
  '/:userId/army',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  userArmyController.getUserArmy,
  response.withMessage('Army retrieved successfully.'),
  response.sendResponse
)

// PUT /users/:userId/army
// URL input: userId
// Body input: armyName
router.put(
  '/:userId/army',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  userArmyController.updateUserArmy,
  response.withMessage('Army updated successfully.'),
  response.sendResponse
)

// POST /users/:userId/army/restart
// URL input: userId
// Body input: none
router.post(
  '/:userId/army/restart',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  userArmyController.restartUserArmy,
  response.withMessage('Game restarted successfully.'),
  response.sendResponse
)

// GET /users/:userId/army/state
// URL input: userId
// Body input: none
router.get(
  '/:userId/army/state',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  userArmyController.getUserArmyState,
  response.withMessage('Army state retrieved successfully.'),
  response.sendResponse
)

export default router
