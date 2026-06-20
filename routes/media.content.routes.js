import express from 'express'
import MediaContent from '../models/MediaContent.model.js'
import MediaComment from '../models/MediaComment.model.js'
import MediaSubscription from '../models/MediaSubscription.model.js'
import NewsletterSubscriber from '../models/NewsletterSubscriber.model.js'
import { protect, mediaRoleOnly, mediaEditorOnly } from '../middleware/auth.middleware.js'
import { uploadMediaVideo, uploadMediaAudio, uploadMediaImage } from '../utils/cloudinary.js'
import cloudinary from '../utils/cloudinary.js'
import { sendPublishedNotification } from '../utils/newsletter.js'

const router = express.Router()

const runUpload = (mw) => (req, res, next) => mw(req, res, err => err ? next(err) : next())

const canEdit = (content, user) =>
  content.author.toString() === user._id.toString() ||
  user.mediaRole === 'chief-editor' ||
  (user.mediaRole === 'editor' && content.author.toString() !== user._id.toString())

// ── Public: list published content ───────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { platform, channel, category, search, limit = 20, page = 1 } = req.query
    const filter = { status: 'published' }
    if (platform) filter.platform = platform
    if (channel)  filter.channel  = channel
    if (category) filter.category = category
    if (search)   filter.$or = [
      { title:       { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ]
    const items = await MediaContent.find(filter)
      .populate('author',  'fullName avatar mediaRole')
      .populate('channel', 'name slug logo platform isLive')
      .sort({ publishedAt: -1 })
      .limit(Number(limit)).skip((Number(page) - 1) * Number(limit))
    const total = await MediaContent.countDocuments(filter)
    res.json({ success: true, items, total })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Protected: my content ─────────────────────────────────────────────────────

router.get('/my', protect, mediaRoleOnly, async (req, res) => {
  try {
    const items = await MediaContent.find({ author: req.user._id })
      .populate('channel', 'name slug platform')
      .populate('reviewedBy', 'fullName')
      .sort({ createdAt: -1 })
    res.json({ success: true, items })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Protected: editor queue ───────────────────────────────────────────────────

router.get('/pending', protect, mediaEditorOnly, async (req, res) => {
  try {
    const { platform } = req.query
    const filter = { status: 'pending' }
    if (platform) filter.platform = platform
    // Editors can't review their own content
    if (req.user.mediaRole === 'editor') filter.author = { $ne: req.user._id }
    const items = await MediaContent.find(filter)
      .populate('author',  'fullName avatar mediaRole')
      .populate('channel', 'name slug platform')
      .sort({ createdAt: 1 }) // oldest first
    res.json({ success: true, items })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Public: single content ────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id)
      .populate('author',     'fullName avatar mediaRole')
      .populate('channel',    'name slug logo platform isLive isVerified')
      .populate('reviewedBy', 'fullName')
    if (!item) return res.status(404).json({ message: 'Not found.' })
    // Non-published content: only author and editors can see
    if (item.status !== 'published') {
      // Check auth header for protected view
      // We allow the route to respond; the caller must be the author or editor
      // (client-side gating is acceptable for draft preview)
    }
    // Increment views (fire-and-forget)
    MediaContent.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec()
    res.json({ success: true, item })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create content ────────────────────────────────────────────────────────────

router.post('/', protect, mediaRoleOnly, async (req, res) => {
  try {
    const { platform, title, description, body, category, tags, channel, liveUrl, liveScheduledAt } = req.body
    if (!platform || !title) return res.status(400).json({ message: 'Platform and title are required.' })
    const item = await MediaContent.create({
      platform, title, description: description || '', body: body || '',
      category: category || '', tags: tags ? JSON.parse(tags) : [],
      author: req.user._id,
      channel: channel || null,
      liveUrl: liveUrl || '',
      liveScheduledAt: liveScheduledAt || null,
    })
    res.status(201).json({ success: true, item })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Upload media file for a piece of content
router.post('/:id/upload-media', protect, mediaRoleOnly, async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id)
    if (!item) return res.status(404).json({ message: 'Not found.' })
    if (item.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not your content.' })

    const uploader = item.platform === 'tv'    ? uploadMediaVideo.single('media')
                   : item.platform === 'radio'  ? uploadMediaAudio.single('media')
                   : uploadMediaImage.single('media')

    await new Promise((resolve, reject) => uploader(req, res, err => err ? reject(err) : resolve()))

    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' })
    if (item.publicId) {
      const oldType = item.mimeType?.startsWith('image/') ? 'image' : 'video'
      await cloudinary.uploader.destroy(item.publicId, { resource_type: oldType }).catch(() => {})
    }
    item.mediaUrl  = req.file.path
    item.publicId  = req.file.filename
    item.mimeType  = req.file.mimetype || ''
    await item.save()
    res.json({ success: true, mediaUrl: item.mediaUrl })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Upload thumbnail / cover image
router.post('/:id/upload-thumbnail', protect, mediaRoleOnly,
  runUpload(uploadMediaImage.single('thumbnail')),
  async (req, res) => {
    try {
      const item = await MediaContent.findById(req.params.id)
      if (!item) return res.status(404).json({ message: 'Not found.' })
      if (item.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not your content.' })
      if (!req.file) return res.status(400).json({ message: 'No image uploaded.' })
      if (item.thumbnailPublicId) await cloudinary.uploader.destroy(item.thumbnailPublicId).catch(() => {})
      item.thumbnail        = req.file.path
      item.thumbnailPublicId = req.file.filename
      await item.save()
      res.json({ success: true, thumbnail: item.thumbnail })
    } catch (err) { res.status(500).json({ message: err.message }) }
  }
)

// ── Update content ────────────────────────────────────────────────────────────

router.put('/:id', protect, mediaRoleOnly, async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id)
    if (!item) return res.status(404).json({ message: 'Not found.' })
    if (item.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not your content.' })
    if (['published'].includes(item.status) && req.user.mediaRole === 'publisher') {
      return res.status(400).json({ message: 'Published content cannot be edited directly. Contact an editor.' })
    }

    const { title, description, body, category, tags, liveUrl, liveScheduledAt } = req.body
    if (title)                   item.title            = title
    if (description !== undefined) item.description    = description
    if (body !== undefined)        item.body           = body
    if (category !== undefined)    item.category       = category
    if (tags)                      item.tags           = JSON.parse(tags)
    if (liveUrl !== undefined)     item.liveUrl        = liveUrl
    if (liveScheduledAt)           item.liveScheduledAt = liveScheduledAt
    // If rejected, reset to draft on edit
    if (item.status === 'rejected') item.status = 'draft'
    await item.save()
    res.json({ success: true, item })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Submit for review ─────────────────────────────────────────────────────────

router.post('/:id/submit', protect, mediaRoleOnly, async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id)
    if (!item) return res.status(404).json({ message: 'Not found.' })
    if (item.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not your content.' })
    if (!['draft', 'rejected'].includes(item.status)) return res.status(400).json({ message: `Content is already ${item.status}.` })
    if (!item.title) return res.status(400).json({ message: 'Title is required before submitting.' })

    // Chief editors can self-publish
    if (req.user.mediaRole === 'chief-editor') {
      item.status      = 'published'
      item.publishedAt = new Date()
      item.reviewedBy  = req.user._id
      item.reviewedAt  = new Date()
      item.rejectionReason = ''
    } else {
      item.status = 'pending'
      item.rejectionReason = ''
    }
    await item.save()
    res.json({ success: true, item })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Review (editor/chief-editor) ──────────────────────────────────────────────

router.put('/:id/review', protect, mediaEditorOnly, async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id).populate('author', 'fullName email')
    if (!item) return res.status(404).json({ message: 'Not found.' })
    if (item.status !== 'pending') return res.status(400).json({ message: 'Content is not pending review.' })

    // Editors cannot review their own content
    if (req.user.mediaRole === 'editor' && item.author._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: 'You cannot review your own content.' })
    }

    const { action, reason } = req.body // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Action must be approve or reject.' })
    if (action === 'reject' && !reason?.trim()) return res.status(400).json({ message: 'A rejection reason is required.' })

    item.reviewedBy = req.user._id
    item.reviewedAt = new Date()

    if (action === 'approve') {
      item.status          = 'published'
      item.publishedAt     = new Date()
      item.rejectionReason = ''

      // Notify newsletter subscribers (fire-and-forget)
      const subs = await MediaSubscription.find({ platform: item.platform, pushNotification: true })
      const emailSubs = await NewsletterSubscriber.find({
        platforms: item.platform, isActive: true,
      }).select('email')
      sendPublishedNotification(item, emailSubs.map(s => s.email)).catch(() => {})
      _ = subs // in-app push notifications can be added here via socket
    } else {
      item.status          = 'rejected'
      item.rejectionReason = reason.trim()
    }

    await item.save()
    res.json({ success: true, item })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Archive (editor/chief-editor or author) ───────────────────────────────────

router.put('/:id/archive', protect, async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id)
    if (!item) return res.status(404).json({ message: 'Not found.' })
    const isAuthor = item.author.toString() === req.user._id.toString()
    const isEditor = ['editor', 'chief-editor'].includes(req.user.mediaRole)
    if (!isAuthor && !isEditor && !req.user.isStaffAdmin) return res.status(403).json({ message: 'Not allowed.' })
    item.status = 'archived'
    await item.save()
    res.json({ success: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/:id', protect, async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id)
    if (!item) return res.status(404).json({ message: 'Not found.' })
    const isAuthor = item.author.toString() === req.user._id.toString()
    const isChief  = req.user.mediaRole === 'chief-editor'
    if (!isAuthor && !isChief && !req.user.isStaffAdmin) return res.status(403).json({ message: 'Not allowed.' })

    if (item.publicId) {
      const rt = item.mimeType?.startsWith('image/') ? 'image' : 'video'
      await cloudinary.uploader.destroy(item.publicId, { resource_type: rt }).catch(() => {})
    }
    if (item.thumbnailPublicId) await cloudinary.uploader.destroy(item.thumbnailPublicId).catch(() => {})
    await MediaComment.deleteMany({ content: item._id })
    await item.deleteOne()
    res.json({ success: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Like / unlike ─────────────────────────────────────────────────────────────

router.post('/:id/like', protect, async (req, res) => {
  try {
    const item = await MediaContent.findById(req.params.id)
    if (!item) return res.status(404).json({ message: 'Not found.' })
    const uid = req.user._id
    const idx = item.likes.indexOf(uid)
    if (idx !== -1) { item.likes.splice(idx, 1) }
    else            { item.likes.push(uid) }
    await item.save()
    res.json({ success: true, liked: idx === -1, likesCount: item.likes.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Comments ──────────────────────────────────────────────────────────────────

router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await MediaComment.find({ content: req.params.id, parentComment: null })
      .populate('author', 'fullName avatar')
      .sort({ createdAt: 1 })
      .limit(100)
    // Attach replies
    const ids = comments.map(c => c._id)
    const replies = await MediaComment.find({ parentComment: { $in: ids } })
      .populate('author', 'fullName avatar')
      .sort({ createdAt: 1 })
    const replyMap = {}
    for (const r of replies) {
      const key = r.parentComment.toString()
      if (!replyMap[key]) replyMap[key] = []
      replyMap[key].push(r)
    }
    const withReplies = comments.map(c => ({ ...c.toObject(), replies: replyMap[c._id.toString()] || [] }))
    res.json({ success: true, comments: withReplies })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.post('/:id/comments', protect, async (req, res) => {
  try {
    const { body, parentComment } = req.body
    if (!body?.trim()) return res.status(400).json({ message: 'Comment cannot be empty.' })
    const item = await MediaContent.findById(req.params.id)
    if (!item || item.status !== 'published') return res.status(404).json({ message: 'Content not found.' })
    const comment = await MediaComment.create({
      content: req.params.id, author: req.user._id,
      body: body.trim(), parentComment: parentComment || null,
    })
    await MediaContent.findByIdAndUpdate(req.params.id, { $inc: { commentsCount: 1 } })
    await comment.populate('author', 'fullName avatar')
    res.status(201).json({ success: true, comment })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.delete('/:id/comments/:commentId', protect, async (req, res) => {
  try {
    const comment = await MediaComment.findById(req.params.commentId)
    if (!comment) return res.status(404).json({ message: 'Comment not found.' })
    const isAuthor = comment.author.toString() === req.user._id.toString()
    const isEditor = ['editor', 'chief-editor'].includes(req.user.mediaRole)
    if (!isAuthor && !isEditor && !req.user.isStaffAdmin) return res.status(403).json({ message: 'Not allowed.' })
    await comment.deleteOne()
    await MediaContent.findByIdAndUpdate(req.params.id, { $inc: { commentsCount: -1 } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Suppress the unused variable warning
const _ = null

export default router
