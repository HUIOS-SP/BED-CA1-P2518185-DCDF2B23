import { Router } from 'express'
import * as userController from '../controllers/userController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// User routes cover profile CRUD only; army gameplay has its own route module
// GET /users
// Query input: optional username
// Body input: none
router.get(
  '/',
  userController.getUsers,
  response.withMessage('Users retrieved successfully.'),
  response.sendResponse
)

// POST /users
// URL input: none
// Body input: username, optional armyName
router.post(
  '/',
  userController.createUser,
  response.withMessage(
    'User created successfully. Starting army and endless campaign created.',
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

export default router
