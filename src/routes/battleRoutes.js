import { Router } from 'express'
import * as battleController from '../controllers/battleController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// POST /users/:userId/army/battle
// URL input: userId
// Body input: none
router.post(
  '/:userId/army/battle',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  battleController.resolveBattle,
  response.withMessage('Battle resolved successfully.'),
  response.sendResponse
)

export default router
