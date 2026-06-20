import express from 'express'
import { Readable } from 'stream'
import multer from 'multer'
import Pulse from '../models/Pulse.model.js'
import { protect } from '../middleware/auth.middleware.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Only run multer when the request is multipart (image attached); skip for JSON posts
const maybeUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) return upload.single('image')(req, res, next)
  next()
}

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

// GET feed
router.get('/', protect, async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1
    const limit = parseInt(req.query.limit) || 20
    const pulses = await Pulse.find()
      .populate('author', 'fullName avatar level accountType')
      .populate('replies.author', 'fullName avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
    res.json({ success: true, pulses })
  } catch { res.status(500).json({ message: 'Failed to load pulses.' }) }
})

// POST create
router.post('/', protect, maybeUpload, async (req, res) => {
  try {
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ message: 'Content is required.' })

    let image = ''
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/pulse',
        resource_type: 'image',
        transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
      })
      image = result.secure_url
    }

    const pulse = await Pulse.create({ author: req.user._id, content: content.trim(), image })
    await pulse.populate('author', 'fullName avatar level accountType')
    res.status(201).json({ success: true, pulse })
  } catch (err) { res.status(500).json({ message: err.message || 'Failed to create pulse.' }) }
})

// DELETE
router.delete('/:id', protect, async (req, res) => {
  try {
    const pulse = await Pulse.findById(req.params.id)
    if (!pulse) return res.status(404).json({ message: 'Pulse not found.' })
    const isOwner = pulse.author.toString() === req.user._id.toString()
    const isAdmin = req.user.isStaffAdmin || req.user.isStudentAdmin
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorised.' })
    await pulse.deleteOne()
    res.json({ success: true })
  } catch { res.status(500).json({ message: 'Failed to delete.' }) }
})

// LIKE toggle
router.post('/:id/like', protect, async (req, res) => {
  try {
    const pulse = await Pulse.findById(req.params.id)
    if (!pulse) return res.status(404).json({ message: 'Not found.' })
    const idx = pulse.likes.indexOf(req.user._id)
    if (idx === -1) pulse.likes.push(req.user._id)
    else pulse.likes.splice(idx, 1)
    await pulse.save()
    res.json({ success: true, likes: pulse.likes.length, liked: idx === -1 })
  } catch { res.status(500).json({ message: 'Failed.' }) }
})

// REPLY
router.post('/:id/reply', protect, async (req, res) => {
  try {
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ message: 'Reply cannot be empty.' })
    const pulse = await Pulse.findById(req.params.id)
    if (!pulse) return res.status(404).json({ message: 'Not found.' })
    pulse.replies.push({ author: req.user._id, content: content.trim() })
    await pulse.save()
    await pulse.populate('replies.author', 'fullName avatar')
    const reply = pulse.replies[pulse.replies.length - 1]
    res.status(201).json({ success: true, reply })
  } catch { res.status(500).json({ message: 'Failed.' }) }
})

export default router
