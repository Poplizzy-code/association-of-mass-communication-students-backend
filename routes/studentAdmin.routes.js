import express from 'express'
import User from '../models/User.model.js'
import Event from '../models/Event.model.js'
import Research from '../models/Research.model.js'
import Spotlight from '../models/Spotlight.model.js'
import PressRelease from '../models/PressRelease.model.js'
import { protect, studentAdminOnly } from '../middleware/auth.middleware.js'
import { uploadNewsImage, uploadEventImage, uploadResearchImage } from '../utils/cloudinary.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()
router.use(protect, studentAdminOnly)

const runUpload = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => (err ? next(err) : next()))

// ── Spotlight ─────────────────────────────────────────────────────────────────
router.get('/spotlights', async (req, res) => {
  const spotlights = await Spotlight.find().populate('createdBy', 'fullName').sort({ createdAt: -1 })
  res.json({ success: true, spotlights })
})

router.post('/spotlights', runUpload(uploadNewsImage.single('image')), async (req, res) => {
  try {
    const { studentName, projectTitle, level, description } = req.body
    if (!studentName || !projectTitle || !level) {
      return res.status(400).json({ message: 'Student name, project title, and level are required.' })
    }
    const item = await Spotlight.create({
      studentName, projectTitle, level,
      description: description || '',
      imageUrl: req.file?.path || '',
      publicId: req.file?.filename || '',
      createdBy: req.user._id,
    })
    await item.populate('createdBy', 'fullName')
    res.status(201).json({ success: true, spotlight: item })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create spotlight.', error: error.message })
  }
})

router.delete('/spotlights/:id', async (req, res) => {
  const item = await Spotlight.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Not found.' })
  if (item.publicId) await cloudinary.uploader.destroy(item.publicId, { resource_type: 'image' }).catch(() => {})
  await item.deleteOne()
  res.json({ success: true })
})

// ── Press Release ─────────────────────────────────────────────────────────────
router.get('/press', async (req, res) => {
  const releases = await PressRelease.find().populate('author', 'fullName').sort({ createdAt: -1 })
  res.json({ success: true, releases })
})

router.post('/press', runUpload(uploadNewsImage.single('image')), async (req, res) => {
  try {
    const { title, content } = req.body
    if (!title || !content) return res.status(400).json({ message: 'Title and content are required.' })
    const release = await PressRelease.create({
      title, content,
      imageUrl: req.file?.path || '',
      publicId: req.file?.filename || '',
      author: req.user._id,
    })
    await release.populate('author', 'fullName')
    res.status(201).json({ success: true, release })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create press release.', error: error.message })
  }
})

router.delete('/press/:id', async (req, res) => {
  const release = await PressRelease.findById(req.params.id)
  if (!release) return res.status(404).json({ message: 'Not found.' })
  if (release.publicId) await cloudinary.uploader.destroy(release.publicId, { resource_type: 'image' }).catch(() => {})
  await release.deleteOne()
  res.json({ success: true })
})

// ── Research ──────────────────────────────────────────────────────────────────
router.get('/research', async (req, res) => {
  const items = await Research.find().populate('author', 'fullName').sort({ createdAt: -1 })
  res.json({ success: true, research: items })
})

router.post('/research', runUpload(uploadResearchImage.single('image')), async (req, res) => {
  try {
    const { title, description, link, deadline, category } = req.body
    if (!title || !description) return res.status(400).json({ message: 'Title and description are required.' })
    const item = await Research.create({
      title, description,
      link: link || '', deadline: deadline || null,
      category: category || 'other',
      imageUrl: req.file?.path || '',
      publicId: req.file?.filename || '',
      author: req.user._id,
    })
    await item.populate('author', 'fullName')
    res.status(201).json({ success: true, research: item })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create research item.', error: error.message })
  }
})

router.delete('/research/:id', async (req, res) => {
  const item = await Research.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Not found.' })
  if (item.publicId) await cloudinary.uploader.destroy(item.publicId, { resource_type: 'image' }).catch(() => {})
  await item.deleteOne()
  res.json({ success: true })
})

// ── Events ────────────────────────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  const events = await Event.find().populate('author', 'fullName').sort({ date: 1 })
  res.json({ success: true, events })
})

router.post('/events', runUpload(uploadEventImage.single('image')), async (req, res) => {
  try {
    const { title, description, date, time, location } = req.body
    if (!title || !description || !date) return res.status(400).json({ message: 'Title, description and date are required.' })
    const event = await Event.create({
      title, description, date, time: time || '', location: location || '',
      imageUrl: req.file?.path || '',
      publicId: req.file?.filename || '',
      author: req.user._id,
    })
    await event.populate('author', 'fullName')
    res.status(201).json({ success: true, event })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create event.', error: error.message })
  }
})

router.delete('/events/:id', async (req, res) => {
  const event = await Event.findById(req.params.id)
  if (!event) return res.status(404).json({ message: 'Not found.' })
  if (event.publicId) await cloudinary.uploader.destroy(event.publicId, { resource_type: 'image' }).catch(() => {})
  await event.deleteOne()
  res.json({ success: true })
})

// ── Student Admin Management ───────────────────────────────────────────────────
router.get('/students', async (req, res) => {
  const students = await User.find({ accountType: 'student' })
    .select('fullName email level matricNumber isStudentAdmin avatar')
    .sort({ fullName: 1 })
  res.json({ success: true, students })
})

router.put('/students/:id/admin', async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ message: 'You cannot change your own admin status.' })
  }
  const { isStudentAdmin } = req.body
  const student = await User.findOneAndUpdate(
    { _id: req.params.id, accountType: 'student' },
    { isStudentAdmin: Boolean(isStudentAdmin) },
    { new: true }
  ).select('fullName email level isStudentAdmin')
  if (!student) return res.status(404).json({ message: 'Student not found.' })
  res.json({ success: true, student })
})

export default router
