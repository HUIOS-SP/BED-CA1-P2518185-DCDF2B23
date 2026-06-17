import { Router } from 'express'
import * as tradeController from '../controllers/tradeController.js'

const router = Router()

// POST /users/:userId/army/trade
// URL input: userId
// Body input: tradeType, item, quantity
router.post('/:userId/army/trade', tradeController.tradeResources)

export default router
