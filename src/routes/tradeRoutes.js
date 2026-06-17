import { Router } from 'express'
import * as tradeController from '../controllers/tradeController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// POST /users/:userId/army/trade
// URL input: userId
// Body input: tradeType, item, quantity
router.post(
  '/:userId/army/trade',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  tradeController.tradeResources,
  response.withMessage('Trade completed successfully.'),
  response.sendResponse
)

export default router
