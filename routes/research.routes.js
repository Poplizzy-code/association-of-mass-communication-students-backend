import express from 'express'
import Research from '../models/Research.model.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { category } = req.query
    const filter = category ? { category } : {}
    const items = await Research.find(filter).populate('author', 'fullName').sort({ createdAt: -1 })
    res.json({ success: true, research: items })
  } catch {
    res.status(500).json({ message: 'Failed to fetch research.' })
  }
})

export default router
