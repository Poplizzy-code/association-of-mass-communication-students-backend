import express from 'express'
import { register, login, logout, getMe, verifyEmail, resendVerification } from '../controllers/auth.controller.js'
import { sendVerificationEmail } from '../utils/mailer.js'
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.post('/logout', protect, logout)
router.get('/me', protect, getMe)
router.get('/verify-email', verifyEmail)
router.post('/resend-verification', resendVerification)

router.get('/test-email', async (req, res) => {
  const to = req.query.to
  if (!to) return res.status(400).json({ message: 'Pass ?to=your@email.com' })
  try {
    await sendVerificationEmail(to, 'Test User', 'test-token-123')
    res.json({ success: true, message: `Test email sent to ${to}` })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
