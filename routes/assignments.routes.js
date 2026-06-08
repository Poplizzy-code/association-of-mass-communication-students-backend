import express from 'express'
import Assignment from '../models/Assignment.model.js'
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

router.get('/', protect, async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate('createdBy', 'fullName')
      .sort({ dueDate: 1 })
    res.json({ success: true, assignments })
  } catch {
    res.status(500).json({ message: 'Failed to fetch assignments.' })
  }
})

export default router
