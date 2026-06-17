import { Router } from 'express'
import * as armyLogController from '../controllers/armyLogController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// GET /users/:userId/army/logs
// URL input: userId
// Query input: optional eventType, optional limit
// Body input: none
router.get(
  '/:userId/army/logs',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  armyLogController.getArmyLogs,
  response.withMessage('Army logs retrieved successfully.'),
  response.sendResponse
)

export default router
