import express from 'express'
import FriendRequest from '../models/FriendRequest.model.js'
import Notification from '../models/Notification.model.js'
import { protect } from '../middleware/auth.middleware.js'
import { getIO } from '../utils/socket.js'

const router = express.Router()

// Send a friend request
router.post('/request', protect, async (req, res) => {
  try {
    const { recipientId } = req.body
    const senderId = req.user._id.toString()

    if (senderId === recipientId) {
      return res.status(400).json({ message: 'Cannot send a friend request to yourself.' })
    }

    const existing = await FriendRequest.findOne({
      $or: [
        { sender: senderId, recipient: recipientId },
        { sender: recipientId, recipient: senderId },
      ],
    })

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ message: 'Already friends.' })
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ message: 'Friend request already sent.' })
      }
      // Reactivate a previously rejected request
      existing.status = 'pending'
      existing.sender = senderId
      existing.recipient = recipientId
      await existing.save()

      const notif = await Notification.create({
        recipient: recipientId,
        sender: senderId,
        type: 'friend_request',
        content: `${req.user.fullName} sent you a friend request`,
        referenceId: existing._id,
        referenceModel: 'FriendRequest',
      })
      await notif.populate('sender', 'fullName')
      getIO()?.to(`user:${recipientId}`).emit('notification', notif)
      return res.json({ success: true, request: existing })
    }

    const request = await FriendRequest.create({ sender: senderId, recipient: recipientId })

    const notif = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type: 'friend_request',
      content: `${req.user.fullName} sent you a friend request`,
      referenceId: request._id,
      referenceModel: 'FriendRequest',
    })
    await notif.populate('sender', 'fullName')
    getIO()?.to(`user:${recipientId}`).emit('notification', notif)

    res.status(201).json({ success: true, request })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Friend request already sent.' })
    }
    res.status(500).json({ message: 'Failed to send friend request.' })
  }
})

// Accept a friend request
router.put('/accept/:requestId', protect, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId)
    if (!request) return res.status(404).json({ message: 'Request not found.' })
    if (request.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized.' })
    }
    request.status = 'accepted'
    await request.save()

    const notif = await Notification.create({
      recipient: request.sender,
      sender: req.user._id,
      type: 'friend_accepted',
      content: `${req.user.fullName} accepted your friend request`,
      referenceId: request._id,
      referenceModel: 'FriendRequest',
    })
    await notif.populate('sender', 'fullName')
    getIO()?.to(`user:${request.sender}`).emit('notification', notif)

    res.json({ success: true, request })
  } catch {
    res.status(500).json({ message: 'Failed to accept request.' })
  }
})

// Reject a friend request
router.put('/reject/:requestId', protect, async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId)
    if (!request) return res.status(404).json({ message: 'Request not found.' })
    if (request.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized.' })
    }
    request.status = 'rejected'
    await request.save()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to reject request.' })
  }
})

// Get friendship status with a specific user
router.get('/status/:userId', protect, async (req, res) => {
  try {
    const request = await FriendRequest.findOne({
      $or: [
        { sender: req.user._id, recipient: req.params.userId },
        { sender: req.params.userId, recipient: req.user._id },
      ],
    })

    if (!request) return res.json({ status: 'none' })

    const isSender = request.sender.toString() === req.user._id.toString()
    res.json({ status: request.status, requestId: request._id, isSender })
  } catch {
    res.status(500).json({ message: 'Failed to get friendship status.' })
  }
})

// Get pending incoming friend requests
router.get('/requests', protect, async (req, res) => {
  try {
    const requests = await FriendRequest.find({ recipient: req.user._id, status: 'pending' })
      .populate('sender', 'fullName accountType level')
      .sort({ createdAt: -1 })
    res.json({ success: true, requests })
  } catch {
    res.status(500).json({ message: 'Failed to fetch requests.' })
  }
})

// Get friend list
router.get('/', protect, async (req, res) => {
  try {
    const accepted = await FriendRequest.find({
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
      status: 'accepted',
    })
      .populate('sender', 'fullName accountType level')
      .populate('recipient', 'fullName accountType level')

    const friends = accepted.map(r =>
      r.sender._id.toString() === req.user._id.toString() ? r.recipient : r.sender
    )
    res.json({ success: true, friends })
  } catch {
    res.status(500).json({ message: 'Failed to fetch friends.' })
  }
})

export default router
