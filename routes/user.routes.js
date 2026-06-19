import express from 'express'
import User from '../models/User.model.js'
import { protect, adminOnly } from '../middleware/auth.middleware.js'

const router = express.Router()

router.get('/', protect, adminOnly, async (req, res) => {
  const users = await User.find().select('-password')
  res.json({ success: true, users })
})

// Tech Community members
router.get('/tech-members', protect, async (req, res) => {
  try {
    const users = await User.find({ isTechMember: true })
      .select('fullName accountType level avatar bio')
      .sort({ fullName: 1 })
    res.json({ success: true, users })
  } catch {
    res.status(500).json({ message: 'Failed to fetch tech members.' })
  }
})

// All community members (for DM user picker — includes self for self-messaging)
router.get('/community', protect, async (req, res) => {
  try {
    const users = await User.find()
      .select('fullName accountType level')
      .sort({ fullName: 1 })
      .limit(100)
    res.json({ success: true, users })
  } catch {
    res.status(500).json({ message: 'Failed to fetch community.' })
  }
})

router.put('/profile', protect, async (req, res) => {
  try {
    const { fullName, bio, level } = req.body
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fullName, bio, level },
      { new: true }
    ).select('-password')
    res.json({ success: true, user })
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile.' })
  }
})

router.put('/join-tech', protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { isTechMember: true },
      { new: true }
    ).select('-password')
    res.json({ success: true, user, message: 'Welcome to the Tech Community!' })
  } catch (error) {
    res.status(500).json({ message: 'Error joining tech community.' })
  }
})

export default router
