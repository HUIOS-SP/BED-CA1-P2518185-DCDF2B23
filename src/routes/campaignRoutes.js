import { Router } from 'express'
import * as campaignController from '../controllers/campaignController.js'

const router = Router()

// GET /campaigns
// Query input: none
// Body input: none
router.get('/', campaignController.getCampaigns)

// GET /campaigns/:campaignId/enemies
// URL input: campaignId
// Body input: none
router.get('/:campaignId/enemies', campaignController.getCampaignEnemies)

export default router
