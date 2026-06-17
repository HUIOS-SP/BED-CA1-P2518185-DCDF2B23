import { Router } from 'express'
import * as recruitController from '../controllers/recruitController.js'

const router = Router()

// POST /users/:userId/army/recruit
// URL input: userId
// Body input: unitName, quantity
router.post('/:userId/army/recruit', recruitController.recruitUnits)

export default router
