import { Router } from 'express'
import * as recruitController from '../controllers/recruitController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// POST /users/:userId/army/recruit
// URL input: userId
// Body input: unitName, quantity
router.post(
  '/:userId/army/recruit',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  recruitController.recruitUnits,
  response.withMessage('Units recruited successfully.'),
  response.sendResponse
)

export default router
