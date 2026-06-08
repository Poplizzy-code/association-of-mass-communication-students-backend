import express from 'express'
import User from '../models/User.model.js'
import Resource from '../models/Resource.model.js'
import News from '../models/News.model.js'
import Event from '../models/Event.model.js'
import Research from '../models/Research.model.js'
import Spotlight from '../models/Spotlight.model.js'
import CBTQuestion from '../models/CBTQuestion.model.js'
import Assignment from '../models/Assignment.model.js'
import PressRelease from '../models/PressRelease.model.js'
import { protect, adminOnly } from '../middleware/auth.middleware.js'
import { uploadResource, uploadNewsImage, uploadEventImage, uploadResearchImage, uploadAssignmentFile } from '../utils/cloudinary.js'
import { uploadNewsImage as uploadPressImage } from '../utils/cloudinary.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()

router.use(protect, adminOnly)

// ── Stats ──────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const [totalUsers, totalResources, totalNews, totalAdmins] = await Promise.all([
    User.countDocuments(),
    Resource.countDocuments(),
    News.countDocuments(),
    User.countDocuments({ isStaffAdmin: true }),
  ])
  res.json({ success: true, stats: { totalUsers, totalResources, totalNews, totalAdmins } })
})

// ── Users ──────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 })
  res.json({ success: true, users })
})

router.put('/users/:id/role', async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ message: 'You cannot change your own roles.' })
  }
  const { isLecturer, isStaffAdmin, isStudentAdmin, accountType } = req.body
  const updates = {}
  if (accountType !== undefined) updates.accountType = accountType
  if (isLecturer !== undefined) updates.isLecturer = Boolean(isLecturer)
  if (isStaffAdmin !== undefined) updates.isStaffAdmin = Boolean(isStaffAdmin)
  if (isStudentAdmin !== undefined) updates.isStudentAdmin = Boolean(isStudentAdmin)
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password')
  if (!user) return res.status(404).json({ message: 'User not found.' })
  res.json({ success: true, user })
})

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ message: 'You cannot delete yourself.' })
  }
  const user = await User.findByIdAndDelete(req.params.id)
  if (!user) return res.status(404).json({ message: 'User not found.' })
  res.json({ success: true, message: 'User deleted.' })
})

// ── Resources ──────────────────────────────────────────────────────────────
router.get('/resources', async (req, res) => {
  const resources = await Resource.find()
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 })
  res.json({ success: true, resources })
})

const runUpload = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => (err ? next(err) : next()))

router.post('/resources', runUpload(uploadResource.single('file')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required.' })
    const { title, description, category } = req.body
    if (!title) return res.status(400).json({ message: 'Title is required.' })

    const resource = await Resource.create({
      title,
      description: description || '',
      category: category || 'other',
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
  if (!resource) return res.status(404).json({ message: 'Resource not found.' })
  if (resource.publicId) {
    const type = resource.mimeType?.startsWith('image/') ? 'image'
      : resource.mimeType?.startsWith('video/') ? 'video' : 'raw'
    await cloudinary.uploader.destroy(resource.publicId, { resource_type: type }).catch(() => {})
  }
  await resource.deleteOne()
  res.json({ success: true, message: 'Resource deleted.' })
})

// ── News ──────────────────────────────────────────────────────────────────
router.get('/news', async (req, res) => {
  const newsItems = await News.find().populate('author', 'fullName').sort({ createdAt: -1 })
  res.json({ success: true, news: newsItems })
})

router.post('/news', uploadNewsImage.single('image'), async (req, res) => {
  try {
    const { title, content } = req.body
    if (!title || !content) return res.status(400).json({ message: 'Title and content are required.' })
    const newsItem = await News.create({
      title,
      content,
      imageUrl: req.file?.path || '',
      publicId: req.file?.filename || '',
      author: req.user._id,
    })
    await newsItem.populate('author', 'fullName')
    res.status(201).json({ success: true, news: newsItem })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create news.', error: error.message })
  }
})

router.delete('/news/:id', async (req, res) => {
  const newsItem = await News.findById(req.params.id)
  if (!newsItem) return res.status(404).json({ message: 'News not found.' })
  if (newsItem.publicId) {
    await cloudinary.uploader.destroy(newsItem.publicId, { resource_type: 'image' }).catch(() => {})
  }
  await newsItem.deleteOne()
  res.json({ success: true, message: 'News deleted.' })
})

// ── Final Year Spotlight ───────────────────────────────────────────────────────
router.get('/spotlights', async (req, res) => {
  const spotlights = await Spotlight.find().populate('createdBy', 'fullName').sort({ createdAt: -1 })
  res.json({ success: true, spotlights })
})

router.post('/spotlights', uploadNewsImage.single('image'), async (req, res) => {
  try {
    const { studentName, projectTitle, level, description } = req.body
    if (!studentName || !projectTitle || !level) {
      return res.status(400).json({ message: 'Student name, project title, and level are required.' })
    }
    const item = await Spotlight.create({
      studentName,
      projectTitle,
      level,
      description: description || '',
      imageUrl: req.file?.path || '',
      publicId: req.file?.filename || '',
      createdBy: req.user._id,
    })
    await item.populate('createdBy', 'fullName')
    res.status(201).json({ success: true, spotlight: item })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create spotlight entry.', error: error.message })
  }
})

router.delete('/spotlights/:id', async (req, res) => {
  const item = await Spotlight.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Spotlight entry not found.' })
  if (item.publicId) {
    await cloudinary.uploader.destroy(item.publicId, { resource_type: 'image' }).catch(() => {})
  }
  await item.deleteOne()
  res.json({ success: true, message: 'Spotlight entry deleted.' })
})

// ── Events ───────────────────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  const events = await Event.find().populate('author', 'fullName').sort({ date: 1 })
  res.json({ success: true, events })
})

router.post('/events', uploadEventImage.single('image'), async (req, res) => {
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
  if (!event) return res.status(404).json({ message: 'Event not found.' })
  if (event.publicId) await cloudinary.uploader.destroy(event.publicId, { resource_type: 'image' }).catch(() => {})
  await event.deleteOne()
  res.json({ success: true, message: 'Event deleted.' })
})

// ── Research & Opportunities ───────────────────────────────────────────────────
router.get('/research', async (req, res) => {
  const items = await Research.find().populate('author', 'fullName').sort({ createdAt: -1 })
  res.json({ success: true, research: items })
})

router.post('/research', uploadResearchImage.single('image'), async (req, res) => {
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
  if (!item) return res.status(404).json({ message: 'Item not found.' })
  if (item.publicId) await cloudinary.uploader.destroy(item.publicId, { resource_type: 'image' }).catch(() => {})
  await item.deleteOne()
  res.json({ success: true, message: 'Deleted.' })
})

// ── CBT Questions ─────────────────────────────────────────────────────────────
router.get('/cbt', async (req, res) => {
  const questions = await CBTQuestion.find().populate('createdBy', 'fullName').sort({ course: 1 })
  res.json({ success: true, questions })
})

router.post('/cbt', async (req, res) => {
  try {
    const { course, question, optionA, optionB, optionC, optionD, correctAnswer, explanation } = req.body
    if (!course || !question || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
      return res.status(400).json({ message: 'All question fields are required.' })
    }
    const q = await CBTQuestion.create({ course, question, optionA, optionB, optionC, optionD, correctAnswer, explanation: explanation || '', createdBy: req.user._id })
    await q.populate('createdBy', 'fullName')
    res.status(201).json({ success: true, question: q })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create question.', error: error.message })
  }
})

router.delete('/cbt/:id', async (req, res) => {
  await CBTQuestion.findByIdAndDelete(req.params.id)
  res.json({ success: true, message: 'Question deleted.' })
})

// ── Assignments ────────────────────────────────────────────────────────────────
router.get('/assignments', async (req, res) => {
  const assignments = await Assignment.find().populate('createdBy', 'fullName').sort({ dueDate: 1 })
  res.json({ success: true, assignments })
})

router.post('/assignments', uploadAssignmentFile.single('file'), async (req, res) => {
  try {
    const { title, course, description, dueDate } = req.body
    if (!title || !course || !description || !dueDate) return res.status(400).json({ message: 'All fields are required.' })
    const assignment = await Assignment.create({
      title, course, description, dueDate,
      fileUrl: req.file?.path || '',
      publicId: req.file?.filename || '',
      createdBy: req.user._id,
    })
    await assignment.populate('createdBy', 'fullName')
    res.status(201).json({ success: true, assignment })
  } catch (error) {
    res.status(500).json({ message: 'Failed to create assignment.', error: error.message })
  }
})

router.delete('/assignments/:id', async (req, res) => {
  const a = await Assignment.findById(req.params.id)
  if (!a) return res.status(404).json({ message: 'Assignment not found.' })
  if (a.publicId) await cloudinary.uploader.destroy(a.publicId, { resource_type: 'raw' }).catch(() => {})
  await a.deleteOne()
  res.json({ success: true, message: 'Assignment deleted.' })
})

// ── Press Releases ─────────────────────────────────────────────────────────────
router.get('/press', async (req, res) => {
  const releases = await PressRelease.find().populate('author', 'fullName').sort({ createdAt: -1 })
  res.json({ success: true, releases })
})

router.post('/press', uploadPressImage.single('image'), async (req, res) => {
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

export default router
