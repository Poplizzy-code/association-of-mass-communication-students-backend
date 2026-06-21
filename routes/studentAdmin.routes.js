import express from 'express'
import User from '../models/User.model.js'
import AlumniProfile from '../models/AlumniProfile.model.js'
import Event from '../models/Event.model.js'
import Research from '../models/Research.model.js'
import Spotlight from '../models/Spotlight.model.js'
import PressRelease from '../models/PressRelease.model.js'
import Resource from '../models/Resource.model.js'
import Setting from '../models/Setting.model.js'
import { protect, studentAdminOnly } from '../middleware/auth.middleware.js'
import { uploadNewsImage, uploadEventImage, uploadResearchImage, uploadResource } from '../utils/cloudinary.js'
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

// ── Resources ─────────────────────────────────────────────────────────────────
router.get('/resources', async (req, res) => {
  const resources = await Resource.find({ category: { $ne: 'past-question' } })
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 })
  res.json({ success: true, resources })
})

router.post('/resources', runUpload(uploadResource.single('file')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required.' })
    const { title, description, category } = req.body
    if (!title) return res.status(400).json({ message: 'Title is required.' })
    const resource = await Resource.create({
      title,
      description: description || '',
      category: category || 'lecture-note',
      fileUrl: req.file.path,
      publicId: req.file.filename,
      mimeType: req.file.mimetype || '',
      originalName: req.file.originalname || '',
      uploadedBy: req.user._id,
    })
    await resource.populate('uploadedBy', 'fullName')
    res.status(201).json({ success: true, resource })
  } catch (error) {
    res.status(500).json({ message: 'Upload failed.', error: error.message })
  }
})

router.delete('/resources/:id', async (req, res) => {
  const resource = await Resource.findById(req.params.id)
  if (!resource) return res.status(404).json({ message: 'Not found.' })
  if (resource.publicId) {
    const type = resource.mimeType?.startsWith('image/') ? 'image'
      : resource.mimeType?.startsWith('video/') ? 'video' : 'raw'
    await cloudinary.uploader.destroy(resource.publicId, { resource_type: type }).catch(() => {})
  }
  await resource.deleteOne()
  res.json({ success: true })
})

// ── Past Questions ────────────────────────────────────────────────────────────
router.get('/past-questions', async (req, res) => {
  const resources = await Resource.find({ category: 'past-question' })
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 })
  res.json({ success: true, resources })
})

router.post('/past-questions', runUpload(uploadResource.single('file')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required.' })
    const { title, description } = req.body
    if (!title) return res.status(400).json({ message: 'Title is required.' })
    const resource = await Resource.create({
      title,
      description: description || '',
      category: 'past-question',
      fileUrl: req.file.path,
      publicId: req.file.filename,
      mimeType: req.file.mimetype || '',
      originalName: req.file.originalname || '',
      uploadedBy: req.user._id,
    })
    await resource.populate('uploadedBy', 'fullName')
    res.status(201).json({ success: true, resource })
  } catch (error) {
    res.status(500).json({ message: 'Upload failed.', error: error.message })
  }
})

router.delete('/past-questions/:id', async (req, res) => {
  const resource = await Resource.findById(req.params.id)
  if (!resource) return res.status(404).json({ message: 'Not found.' })
  if (resource.publicId) {
    const type = resource.mimeType?.startsWith('image/') ? 'image'
      : resource.mimeType?.startsWith('video/') ? 'video' : 'raw'
    await cloudinary.uploader.destroy(resource.publicId, { resource_type: type }).catch(() => {})
  }
  await resource.deleteOne()
  res.json({ success: true })
})

// ── Session Management ────────────────────────────────────────────────────────
router.get('/session', async (req, res) => {
  const settings = await Setting.findOne()
  res.json({ success: true, currentSession: settings?.currentSession || '' })
})

router.post('/session/advance', async (req, res) => {
  try {
    const settings = await Setting.findOne()
    const current = settings?.currentSession || '2025/2026'
    const [y1str, y2str] = current.split('/')
    const y1 = parseInt(y1str) || 2025
    const y2 = parseInt(y2str) || 2026
    const nextSession = `${y1 + 1}/${y2 + 1}`

    // Fetch 400L students before promoting so we can create their alumni profiles
    const toGraduate = await User.find({ accountType: 'student', level: '400' }).select('_id fullName avatar')

    // Graduate 400L → alumni first, then promote in reverse order
    const graduated = await User.updateMany(
      { accountType: 'student', level: '400' },
      { $set: { level: 'alumni', isAlumni: true } }
    )

    // Auto-create AlumniProfile for each newly graduated student
    for (const u of toGraduate) {
      try {
        const exists = await AlumniProfile.findOne({ user: u._id })
        if (!exists) {
          await AlumniProfile.create({
            user: u._id,
            submittedBy: u._id,
            fullName: u.fullName,
            avatar: u.avatar || '',
            graduationYear: new Date().getFullYear(),
            field: 'other',
            status: 'approved',
          })
        }
      } catch (_) { /* skip duplicate */ }
    }
    const promotions = [
      { from: '300', to: '400' },
      { from: '200', to: '300' },
      { from: '100', to: '200' },
    ]
    let totalPromoted = graduated.modifiedCount
    for (const { from, to } of promotions) {
      const result = await User.updateMany(
        { accountType: 'student', level: from },
        { $set: { level: to } }
      )
      totalPromoted += result.modifiedCount
    }

    await Setting.findOneAndUpdate({}, { currentSession: nextSession }, { upsert: true, new: true })
    res.json({ success: true, currentSession: nextSession, totalPromoted })
  } catch (error) {
    res.status(500).json({ message: 'Failed to advance session.', error: error.message })
  }
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
