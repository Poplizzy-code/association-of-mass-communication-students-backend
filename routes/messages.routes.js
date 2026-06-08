import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import Message from '../models/Message.model.js'
import User from '../models/User.model.js'
import FriendRequest from '../models/FriendRequest.model.js'
import Notification from '../models/Notification.model.js'
import { protect } from '../middleware/auth.middleware.js'
import { getIO } from '../utils/socket.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
})

const uploadBuffer = (buffer, options, timeoutMs = 120_000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Upload timed out. Try a smaller file.')),
      timeoutMs
    )
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      clearTimeout(timer)
      if (err) return reject(err)
      resolve(result)
    })
    const readable = new Readable()
    readable.push(buffer)
    readable.push(null)
    readable.pipe(stream)
  })

const getFriendStatus = async (userId1, userId2) => {
  if (userId1.toString() === userId2.toString()) return 'self'
  const req = await FriendRequest.findOne({
    $or: [
      { sender: userId1, recipient: userId2 },
      { sender: userId2, recipient: userId1 },
    ],
  })
  return req ? req.status : 'none'
}

// Unread count — must be before /:userId to avoid route collision
router.get('/unread/count', protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({ recipient: req.user._id, read: false })
    res.json({ success: true, count })
  } catch {
    res.status(500).json({ message: 'Failed to get unread count.' })
  }
})

// Get conversation with a specific user
router.get('/:userId', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.user._id },
      ],
    })
      .populate('sender', 'fullName')
      .populate('recipient', 'fullName')
      .sort({ createdAt: 1 })
      .limit(100)

    await Message.updateMany(
      { sender: req.params.userId, recipient: req.user._id, read: false },
      { read: true }
    )

    const friendStatus = await getFriendStatus(req.user._id, req.params.userId)

    // How many messages current user has already sent (to show limit info)
    let sentCount = 0
    if (friendStatus !== 'accepted' && friendStatus !== 'self') {
      sentCount = await Message.countDocuments({
        sender: req.user._id,
        recipient: req.params.userId,
      })
    }

    res.json({ success: true, messages, friendStatus, sentCount })
  } catch {
    res.status(500).json({ message: 'Failed to load conversation.' })
  }
})

// Send a message (supports text, emoji, sticker, media)
router.post('/', protect, upload.single('media'), async (req, res) => {
  try {
    const { recipientId, content, messageType = 'text', stickerId } = req.body
    const isSelf = recipientId === req.user._id.toString()

    if (!content?.trim() && !req.file && !stickerId) {
      return res.status(400).json({ message: 'Message cannot be empty.' })
    }

    if (!isSelf) {
      const recipient = await User.findById(recipientId)
      if (!recipient) return res.status(404).json({ message: 'User not found.' })

      const friendStatus = await getFriendStatus(req.user._id, recipientId)

      if (friendStatus !== 'accepted') {
        const sentCount = await Message.countDocuments({
          sender: req.user._id,
          recipient: recipientId,
        })
        if (sentCount >= 3) {
          return res.status(403).json({
            message: 'Message limit reached. Send a friend request to continue.',
            code: 'FRIEND_REQUIRED',
          })
        }
      }
    }

    // Upload media to Cloudinary if attached
    let mediaUrl = ''
    let mediaType = ''
    let mediaName = ''

    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/')
      const isImage = req.file.mimetype.startsWith('image/')
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/messages',
        resource_type: isVideo ? 'video' : 'auto',
        public_id: `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      })
      mediaUrl = result.secure_url
      mediaType = isVideo ? 'video' : isImage ? 'image' : 'file'
      mediaName = req.file.originalname
    }

    const finalType = req.file ? 'media' : stickerId ? 'sticker' : messageType

    const message = await Message.create({
      sender: req.user._id,
      recipient: recipientId,
      content: content?.trim() || '',
      messageType: finalType,
      mediaUrl,
      mediaType,
      mediaName,
      stickerId: stickerId || '',
    })

    await message.populate('sender', 'fullName')
    await message.populate('recipient', 'fullName')

    getIO()?.to(`user:${recipientId}`).emit('new_message', message)

    // Notify recipient (skip for self-messages)
    if (!isSelf) {
      const notifContent = req.file
        ? `${req.user.fullName} sent you a ${mediaType}`
        : stickerId
        ? `${req.user.fullName} sent you a sticker`
        : `${req.user.fullName}: ${(content || '').slice(0, 60)}`

      const notif = await Notification.create({
        recipient: recipientId,
        sender: req.user._id,
        type: 'message',
        content: notifContent,
        referenceId: message._id,
        referenceModel: 'Message',
      })
      await notif.populate('sender', 'fullName')
      getIO()?.to(`user:${recipientId}`).emit('notification', notif)
    }

    res.status(201).json({ success: true, message })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to send message.' })
  }
})

export default router
