import { Router } from 'express'
import * as userArmyController from '../controllers/userArmyController.js'

const router = Router()

// GET /users/:userId/army
// URL input: userId
// Body input: none
router.get('/:userId/army', userArmyController.getUserArmy)

// POST /users/:userId/army
// URL input: userId
// Body input: armyName
router.post('/:userId/army', userArmyController.createUserArmy)

// PUT /users/:userId/army
// URL input: userId
// Body input: armyName
router.put('/:userId/army', userArmyController.updateUserArmy)

// DELETE /users/:userId/army
// URL input: userId
// Body input: none
router.delete('/:userId/army', userArmyController.deleteUserArmy)

// POST /users/:userId/army/restart
// URL input: userId
// Body input: none
router.post('/:userId/army/restart', userArmyController.restartUserArmy)

// GET /users/:userId/army/state
// URL input: userId
// Body input: none
router.get('/:userId/army/state', userArmyController.getUserArmyState)

export default router
