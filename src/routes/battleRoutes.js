import { Router } from 'express'
import * as battleController from '../controllers/battleController.js'

const router = Router()

// POST /users/:userId/army/battle
// URL input: userId
// Body input: none
router.post('/:userId/army/battle', battleController.resolveBattle)

export default router
