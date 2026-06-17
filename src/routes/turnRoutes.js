import { Router } from 'express'
import * as turnController from '../controllers/turnController.js'

const router = Router()

// POST /users/:userId/army/advance-turn
// URL input: userId
// Body input: none
router.post('/:userId/army/advance-turn', turnController.advanceTurn)

export default router
