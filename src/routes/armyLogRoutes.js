import { Router } from 'express'
import * as armyLogController from '../controllers/armyLogController.js'

const router = Router()

// GET /users/:userId/army/logs
// URL input: userId
// Query input: optional eventType, optional limit
// Body input: none
router.get('/:userId/army/logs', armyLogController.getArmyLogs)

export default router
