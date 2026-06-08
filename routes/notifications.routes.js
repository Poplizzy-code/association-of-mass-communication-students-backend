import express from 'express'
import Notification from '../models/Notification.model.js'
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

// Get notifications (most recent 50)
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'fullName')
      .sort({ createdAt: -1 })
      .limit(50)
    res.json({ success: true, notifications })
  } catch {
    res.status(500).json({ message: 'Failed to fetch notifications.' })
  }
})

// Unread count
router.get('/count', protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, read: false })
    res.json({ success: true, count })
  } catch {
    res.status(500).json({ message: 'Failed to get count.' })
  }
})

// Mark single as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { read: true }
    )
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to mark as read.' })
  }
})

// Mark all as read
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true })
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to mark all as read.' })
  }
})

export default router
