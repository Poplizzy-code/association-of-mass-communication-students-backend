import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import Post from '../models/Post.model.js'
import { protect } from '../middleware/auth.middleware.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB max
})

// Upload a buffer to Cloudinary with an explicit timeout so the server never hangs.
const uploadBuffer = (buffer, options, timeoutMs = 180_000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Cloudinary upload timed out. Try a smaller file or check your connection.')),
      timeoutMs
    )
    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      clearTimeout(timer)
      if (err) return reject(err)
      resolve(result)
    })
    // Create a proper Readable from the buffer and pipe — this is what Cloudinary SDK expects
    const readable = new Readable()
    readable.push(buffer)
    readable.push(null)
    readable.pipe(uploadStream)
  })

// Public — paginated public posts
router.get('/public', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 12)
    const skip  = (page - 1) * limit
    const [posts, total] = await Promise.all([
      Post.find({ isPublic: true }).populate('author', 'fullName avatar').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Post.countDocuments({ isPublic: true }),
    ])
    res.json({ success: true, posts, hasMore: skip + posts.length < total, total })
  } catch {
    res.status(500).json({ message: 'Failed to fetch posts.' })
  }
})

// Authenticated — paginated all posts
router.get('/', protect, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 12)
    const skip  = (page - 1) * limit
    const [posts, total] = await Promise.all([
      Post.find().populate('author', 'fullName avatar').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Post.countDocuments(),
    ])
    res.json({ success: true, posts, hasMore: skip + posts.length < total, total })
  } catch {
    res.status(500).json({ message: 'Failed to fetch posts.' })
  }
})

// Create post
router.post('/', protect, upload.single('media'), async (req, res) => {
  try {
    const { content, isPublic } = req.body
    if (!content?.trim() && !req.file) {
      return res.status(400).json({ message: 'Post must have text or media.' })
    }

    let mediaUrl = ''
    let mediaType = ''
    let publicId = ''

    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/')
      console.log(`[upload] mimetype=${req.file.mimetype} size=${req.file.size} isVideo=${isVideo}`)
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/social',
        resource_type: isVideo ? 'video' : 'image',
        public_id: `${Date.now()}-${req.file.originalname
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      })
      console.log(`[upload] done — url=${result.secure_url}`)
      mediaUrl = result.secure_url
      mediaType = isVideo ? 'video' : 'image'
      publicId = result.public_id
    }

    const post = await Post.create({
      author: req.user._id,
      content: content?.trim() || '',
      mediaUrl,
      mediaType,
      publicId,
      isPublic: isPublic !== 'false' && isPublic !== false,
    })
    await post.populate('author', 'fullName')
    res.status(201).json({ success: true, post })
  } catch (error) {
    console.error('Post create error:', error.message, error.http_code, JSON.stringify(error))
    res.status(500).json({ message: error.message || 'Failed to create post.' })
  }
})

// Toggle like
router.put('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
    if (!post) return res.status(404).json({ message: 'Post not found.' })
    const userId = req.user._id.toString()
    const alreadyLiked = post.likes.some(l => l.toString() === userId)
    if (alreadyLiked) {
      post.likes = post.likes.filter(l => l.toString() !== userId)
    } else {
      post.likes.push(req.user._id)
    }
    await post.save()
    res.json({ success: true, likes: post.likes.length, liked: !alreadyLiked })
  } catch {
    res.status(500).json({ message: 'Failed to update like.' })
  }
})

// Get comments for a post
router.get('/:id/comments', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate('comments.author', 'fullName')
    if (!post) return res.status(404).json({ message: 'Post not found.' })
    res.json({ success: true, comments: post.comments })
  } catch {
    res.status(500).json({ message: 'Failed to fetch comments.' })
  }
})

// Add a comment
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ message: 'Comment cannot be empty.' })
    const post = await Post.findById(req.params.id)
    if (!post) return res.status(404).json({ message: 'Post not found.' })
    post.comments.push({ author: req.user._id, text: text.trim() })
    await post.save()
    await post.populate('comments.author', 'fullName')
    const comment = post.comments[post.comments.length - 1]
    res.status(201).json({ success: true, comment })
  } catch {
    res.status(500).json({ message: 'Failed to add comment.' })
  }
})

// Delete own post
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
    if (!post) return res.status(404).json({ message: 'Post not found.' })
    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized.' })
    }
    if (post.publicId) {
      const type = post.mediaType === 'video' ? 'video' : 'image'
      await cloudinary.uploader.destroy(post.publicId, { resource_type: type }).catch(() => {})
    }
    await post.deleteOne()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to delete post.' })
  }
})

export default router
