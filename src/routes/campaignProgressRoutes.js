import { Router } from 'express'
import * as campaignProgressController from '../controllers/campaignProgressController.js'

const router = Router()

// GET /users/:userId/army/campaign-progress
// URL input: userId
// Body input: none
router.get('/:userId/army/campaign-progress', campaignProgressController.getCampaignProgress)

export default router
