import { Router } from 'express'
import * as turnController from '../controllers/turnController.js'
import * as response from '../middleware/response.js'
import * as userMiddleware from '../middleware/userMiddleware.js'

const router = Router()

// POST /users/:userId/army/advance-turn
// URL input: userId
// Body input: none
router.post(
  '/:userId/army/advance-turn',
  userMiddleware.checkUserId,
  userMiddleware.loadUser,
  userMiddleware.loadUserArmy,
  turnController.advanceTurn,
  response.withDynamicMessage((req, res) => {
    if (res.locals.data.enemyAttacked) {
      return 'Turn advanced. The enemy attacked first.'
    }

    return 'Turn advanced successfully.'
  }),
  response.sendResponse
)

export default router
