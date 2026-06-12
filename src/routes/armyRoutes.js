import { Router } from 'express'
import * as armyController from '../controllers/armyController.js'

const router = Router()

router.get('/', armyController.getArmies)

export default router