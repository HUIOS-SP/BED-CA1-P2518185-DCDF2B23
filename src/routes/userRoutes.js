import { Router } from 'express'
import * as userController from '../controllers/userController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// GET /users
// Query input: optional username
// Body input: none
router.get(
  '/',
  userController.getUsers,
  response.withMessage('Users retrieved successfully.'),
  response.sendResponse
)

// CREATE USER NOW CREATES USER AND ARMY
// POST /users
// URL input: none
// Body input: username, password, optional armyName
router.post(
  '/',
  userController.createUser,
  response.withMessage(
    'User created successfully. Starting army created and Unix Wars started.',
    201
  ),
  response.sendResponse
)

// GET /users/:userId
// URL input: userId
// Body input: none
router.get(
  '/:userId',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userController.getUserById,
  response.withMessage('User retrieved successfully.'),
  response.sendResponse
)

// PUT /users/:userId
// URL input: userId
// Body input: username
// HUGE VULNERABILITY CUZ IT RETURNS USER PASSWORD (maybe fix in CA2?)
router.put(
  '/:userId',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userController.updateUser,
  response.withMessage('User updated successfully.'),
  response.sendResponse
)

// DELETE /users/:userId
// URL input: userId
// Body input: none
router.delete(
  '/:userId',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userController.deleteUser,
  response.sendNoContent
)

// im not sure if we need to do user login yet so dont do first
export default router
