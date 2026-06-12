import { Router } from 'express'
import * as userController from '../controllers/userController.js'

const router = Router()

router.get('/', userController.getUsers)
router.post('/', userController.createUser)

export default router