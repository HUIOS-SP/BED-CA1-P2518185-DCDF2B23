import { Router } from 'express'
import * as campaignController from '../controllers/campaignController.js'
import * as campaignMiddleware from '../middleware/campaignMiddleware.js'
import * as response from '../middleware/response.js'

const router = Router()

// GET /campaigns
// Read-only catalogue route for frontend display and Postman inspection
// Query input: none
// Body input: none
router.get(
  '/',
  campaignController.getCampaigns,
  response.withMessage('Campaigns retrieved successfully.'),
  response.sendResponse
)

// GET /campaigns/:campaignId/enemies
// These are example catalogue enemies only and do not change active endless progress
// URL input: campaignId
// Body input: none
router.get(
  '/:campaignId/enemies',
  campaignMiddleware.checkCampaignId,
  campaignMiddleware.loadCampaign,
  campaignController.getCampaignEnemies,
  response.withMessage('Campaign enemies retrieved successfully.'),
  response.sendResponse
)

export default router
