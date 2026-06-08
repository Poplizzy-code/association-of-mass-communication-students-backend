import express from 'express'
import Spotlight from '../models/Spotlight.model.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const spotlights = await Spotlight.find().populate('createdBy', 'fullName').sort({ createdAt: -1 })
    res.json({ success: true, spotlights })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch spotlights.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const spotlight = await Spotlight.findById(req.params.id).populate('createdBy', 'fullName')
    if (!spotlight) return res.status(404).json({ message: 'Spotlight item not found.' })
    res.json({ success: true, spotlight })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch spotlight item.' })
  }
})

export default router
