import { Router } from 'express'
import * as armyController from '../controllers/armyController.js'

const router = Router()

// GET /armies
// Query input: optional userId
// Body input: none
router.get('/', armyController.getArmies)

export default router
