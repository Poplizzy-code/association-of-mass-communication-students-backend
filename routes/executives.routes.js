import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import ExecutiveProfile from '../models/ExecutiveProfile.model.js'
import { protect } from '../middleware/auth.middleware.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()
router.use(protect)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
    const readable = new Readable()
    readable.push(buffer)
    readable.push(null)
    readable.pipe(stream)
  })

// Only student admins (executives) or staff admins can create/edit profiles
const execGate = (req, res, next) => {
  if (req.user.isStudentAdmin || req.user.isStaffAdmin) return next()
  return res.status(403).json({ message: 'Only executives can manage executive profiles.' })
}

// GET all visible profiles (any authenticated user)
router.get('/', async (req, res) => {
  try {
    const profiles = await ExecutiveProfile.find({ isVisible: true })
      .populate('user', 'fullName avatar email')
      .sort({ order: 1, createdAt: 1 })
      .lean()
    res.json({ profiles })
  } catch {
    res.status(500).json({ message: 'Failed to load executive profiles.' })
  }
})

// GET my own profile
router.get('/mine', execGate, async (req, res) => {
  try {
    const profile = await ExecutiveProfile.findOne({ user: req.user._id })
      .populate('user', 'fullName avatar email').lean()
    res.json({ profile })
  } catch {
    res.status(500).json({ message: 'Failed to load your profile.' })
  }
})

// POST — create or fully upsert own executive profile
router.post('/', execGate, async (req, res) => {
  try {
    const { position, bio, helpText, isVisible, order } = req.body
    if (!position?.trim()) return res.status(400).json({ message: 'Position/title is required.' })

    const profile = await ExecutiveProfile.findOneAndUpdate(
      { user: req.user._id },
      { position: position.trim(), bio: bio?.trim() || '', helpText: helpText?.trim() || '', isVisible: isVisible !== false, order: order ?? 99 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('user', 'fullName avatar email')

    res.json({ success: true, profile })
  } catch (err) {
    res.status(500).json({ message: 'Failed to save profile.', error: err.message })
  }
})

// PUT photo upload for own profile
router.put('/photo', execGate, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image provided.' })
    const result = await uploadBuffer(req.file.buffer, {
      folder: 'amacos/executives',
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }, { quality: 'auto', fetch_format: 'auto' }],
    })
    const profile = await ExecutiveProfile.findOneAndUpdate(
      { user: req.user._id },
      { avatar: result.secure_url },
      { new: true, upsert: true }
    ).populate('user', 'fullName avatar email')
    res.json({ success: true, profile })
  } catch {
    res.status(500).json({ message: 'Failed to upload photo.' })
  }
})

// DELETE own profile
router.delete('/', execGate, async (req, res) => {
  try {
    await ExecutiveProfile.deleteOne({ user: req.user._id })
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to delete profile.' })
  }
})

export default router
