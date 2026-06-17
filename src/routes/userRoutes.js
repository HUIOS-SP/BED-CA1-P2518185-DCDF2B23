import { Router } from 'express'
import * as userController from '../controllers/userController.js'

const router = Router()

// GET /users
// Query input: optional username
// Body input: none
router.get('/', userController.getUsers)



// CREATE USER NOW CREATES USER AND ARMY
// POST /users
// URL input: none
// Body input: username, password
router.post('/', userController.createUser)

// GET /users/:userId
// URL input: userId
// Body input: none
router.get('/:userId', userController.getUserById)

// PUT /users/:userId
// URL input: userId
// Body input: username
router.put('/:userId', userController.updateUser)

// DELETE /users/:userId
// URL input: userId
// Body input: none
router.delete('/:userId', userController.deleteUser)

// im not sure if we need to do user login yet so dont do first
export default router
