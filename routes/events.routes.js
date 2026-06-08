import express from 'express'
import Event from '../models/Event.model.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const events = await Event.find().populate('author', 'fullName').sort({ date: 1 })
    res.json({ success: true, events })
  } catch {
    res.status(500).json({ message: 'Failed to fetch events.' })
  }
})

export default router
