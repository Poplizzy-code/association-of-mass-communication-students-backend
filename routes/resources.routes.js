import express from 'express'
import Resource from '../models/Resource.model.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { category, exclude } = req.query
    const filter = {}
    if (category) filter.category = category
    if (exclude) filter.category = { $ne: exclude }
    const resources = await Resource.find(filter)
      .populate('uploadedBy', 'fullName')
      .sort({ createdAt: -1 })
    res.json({ success: true, resources })
  } catch {
    res.status(500).json({ message: 'Failed to fetch resources.' })
  }
})

export default router
