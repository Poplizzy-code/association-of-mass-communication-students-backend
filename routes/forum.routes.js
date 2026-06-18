import express from 'express'
import ForumThread from '../models/ForumThread.model.js'
import { protect, staffAdminOnly } from '../middleware/auth.middleware.js'

const router = express.Router()
router.use(protect)

// List threads
router.get('/', async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query
    const filter = category && category !== 'all' ? { category } : {}
    const threads = await ForumThread.find(filter)
      .populate('author', 'fullName accountType level avatar')
      .sort({ pinned: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean()
    const result = threads.map(({ replies, ...t }) => ({ ...t, replyCount: replies?.length ?? 0 }))
    const total = await ForumThread.countDocuments(filter)
    res.json({ success: true, threads: result, total })
  } catch {
    res.status(500).json({ message: 'Failed to fetch threads.' })
  }
})

// Create thread
router.post('/', async (req, res) => {
  try {
    const { title, content, category = 'general' } = req.body
    if (!title?.trim()) return res.status(400).json({ message: 'Title is required.' })
    if (!content?.trim()) return res.status(400).json({ message: 'Content is required.' })
    const thread = await ForumThread.create({
      title: title.trim(),
      content: content.trim(),
      category,
      author: req.user._id,
    })
    await thread.populate('author', 'fullName accountType level avatar')
    res.status(201).json({ success: true, thread })
  } catch {
    res.status(500).json({ message: 'Failed to create thread.' })
  }
})

// Get single thread (increments views)
router.get('/:id', async (req, res) => {
  try {
    const thread = await ForumThread.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate('author', 'fullName accountType level avatar')
      .populate('replies.author', 'fullName accountType level avatar')
    if (!thread) return res.status(404).json({ message: 'Thread not found.' })
    res.json({ success: true, thread })
  } catch {
    res.status(500).json({ message: 'Failed to fetch thread.' })
  }
})

// Delete thread (own or staff admin)
router.delete('/:id', async (req, res) => {
  try {
    const thread = await ForumThread.findById(req.params.id)
    if (!thread) return res.status(404).json({ message: 'Thread not found.' })
    const isOwner = thread.author.toString() === req.user._id.toString()
    if (!isOwner && !req.user.isStaffAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this thread.' })
    }
    await thread.deleteOne()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to delete thread.' })
  }
})

// Like / unlike thread
router.put('/:id/like', async (req, res) => {
  try {
    const thread = await ForumThread.findById(req.params.id)
    if (!thread) return res.status(404).json({ message: 'Thread not found.' })
    const idx = thread.likes.indexOf(req.user._id)
    if (idx === -1) thread.likes.push(req.user._id)
    else thread.likes.splice(idx, 1)
    await thread.save()
    res.json({ success: true, likes: thread.likes.length, liked: idx === -1 })
  } catch {
    res.status(500).json({ message: 'Failed to update like.' })
  }
})

// Pin / unpin thread (staff admin)
router.put('/:id/pin', staffAdminOnly, async (req, res) => {
  try {
    const thread = await ForumThread.findById(req.params.id)
    if (!thread) return res.status(404).json({ message: 'Thread not found.' })
    thread.pinned = !thread.pinned
    await thread.save()
    res.json({ success: true, pinned: thread.pinned })
  } catch {
    res.status(500).json({ message: 'Failed to toggle pin.' })
  }
})

// Add reply
router.post('/:id/replies', async (req, res) => {
  try {
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ message: 'Reply cannot be empty.' })
    const thread = await ForumThread.findById(req.params.id)
    if (!thread) return res.status(404).json({ message: 'Thread not found.' })
    thread.replies.push({ author: req.user._id, content: content.trim() })
    thread.updatedAt = new Date()
    await thread.save()
    await thread.populate('replies.author', 'fullName accountType level avatar')
    const reply = thread.replies[thread.replies.length - 1]
    res.status(201).json({ success: true, reply })
  } catch {
    res.status(500).json({ message: 'Failed to add reply.' })
  }
})

// Like / unlike reply
router.put('/:id/replies/:replyId/like', async (req, res) => {
  try {
    const thread = await ForumThread.findById(req.params.id)
    if (!thread) return res.status(404).json({ message: 'Thread not found.' })
    const reply = thread.replies.id(req.params.replyId)
    if (!reply) return res.status(404).json({ message: 'Reply not found.' })
    const idx = reply.likes.indexOf(req.user._id)
    if (idx === -1) reply.likes.push(req.user._id)
    else reply.likes.splice(idx, 1)
    await thread.save()
    res.json({ success: true, likes: reply.likes.length, liked: idx === -1 })
  } catch {
    res.status(500).json({ message: 'Failed to update reply like.' })
  }
})

// Delete reply (own or staff admin)
router.delete('/:id/replies/:replyId', async (req, res) => {
  try {
    const thread = await ForumThread.findById(req.params.id)
    if (!thread) return res.status(404).json({ message: 'Thread not found.' })
    const reply = thread.replies.id(req.params.replyId)
    if (!reply) return res.status(404).json({ message: 'Reply not found.' })
    const isOwner = reply.author.toString() === req.user._id.toString()
    if (!isOwner && !req.user.isStaffAdmin) {
      return res.status(403).json({ message: 'Not authorized.' })
    }
    reply.deleteOne()
    await thread.save()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to delete reply.' })
  }
})

export default router
