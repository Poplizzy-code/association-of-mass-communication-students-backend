import express from 'express'
import { register, login, logout, getMe, verifyEmail, resendVerification } from '../controllers/auth.controller.js'
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.post('/logout', protect, logout)
router.get('/me', protect, getMe)
router.get('/verify-email', verifyEmail)
router.post('/resend-verification', resendVerification)

export default router
