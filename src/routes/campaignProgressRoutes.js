import { Router } from 'express'
import * as campaignProgressController from '../controllers/campaignProgressController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// GET /users/:userId/army/campaign-progress
// URL input: userId
// Body input: none
router.get(
  '/:userId/army/campaign-progress',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  campaignProgressController.getCampaignProgress,
  response.withMessage('Campaign progress retrieved successfully.'),
  response.sendResponse
)

export default router
