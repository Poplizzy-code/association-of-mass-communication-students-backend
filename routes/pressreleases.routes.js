import express from 'express'
import PressRelease from '../models/PressRelease.model.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const releases = await PressRelease.find()
      .populate('author', 'fullName')
      .sort({ createdAt: -1 })
    res.json({ success: true, releases })
  } catch {
    res.status(500).json({ message: 'Failed to fetch press releases.' })
  }
})

export default router
