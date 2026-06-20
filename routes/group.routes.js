import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import Group from '../models/Group.model.js'
import GroupMessage from '../models/GroupMessage.model.js'
import { protect } from '../middleware/auth.middleware.js'
import { getIO } from '../utils/socket.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

const uploadBuffer = (buffer, options, timeoutMs = 120_000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Upload timed out.')), timeoutMs)
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

// Create group
router.post('/', protect, async (req, res) => {
  try {
    const { name, description, memberIds = [] } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Group name is required.' })

    const allMembers = [...new Set([req.user._id.toString(), ...memberIds])]

    const group = await Group.create({
      name: name.trim(),
      description: description?.trim() || '',
      members: allMembers,
      admins: [req.user._id],
      createdBy: req.user._id,
    })

    await group.populate('members', 'fullName accountType level avatar isAlumni')

    // Notify all other members via socket
    const io = getIO()
    if (io) {
      allMembers.forEach(uid => {
        if (uid !== req.user._id.toString()) {
          io.to(`user:${uid}`).emit('group_added', {
            group,
            addedBy: { _id: req.user._id, fullName: req.user.fullName },
          })
        }
      })
    }

    res.status(201).json({ success: true, group })
  } catch (err) {
    res.status(500).json({ message: 'Failed to create group.' })
  }
})

// Get my groups
router.get('/', protect, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate('members', 'fullName accountType level avatar isAlumni')
      .populate('createdBy', 'fullName')
      .sort({ updatedAt: -1 })
    res.json({ success: true, groups })
  } catch {
    res.status(500).json({ message: 'Failed to fetch groups.' })
  }
})

// Get single group
router.get('/:groupId', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('members', 'fullName accountType level avatar isAlumni')
      .populate('admins', 'fullName')
      .populate('createdBy', 'fullName')
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    if (!group.members.some(m => m._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not a member of this group.' })
    }
    res.json({ success: true, group })
  } catch {
    res.status(500).json({ message: 'Failed to fetch group.' })
  }
})

// Get group messages
router.get('/:groupId/messages', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not a member.' })
    }
    const messages = await GroupMessage.find({ group: req.params.groupId })
      .populate('sender', 'fullName accountType avatar')
      .sort({ createdAt: 1 })
      .limit(100)
    res.json({ success: true, messages })
  } catch {
    res.status(500).json({ message: 'Failed to fetch messages.' })
  }
})

// Send a group message
router.post('/:groupId/messages', protect, upload.single('media'), async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not a member.' })
    }

    const { content = '', messageType = 'text', stickerId = '' } = req.body
    let mediaUrl = '', mediaType = '', mediaName = ''

    if (req.file) {
      const mime = req.file.mimetype
      const folder = 'amacos/group_messages'
      let resourceType = 'auto'
      if (mime.startsWith('image/')) { mediaType = 'image' }
      else if (mime.startsWith('video/')) { mediaType = 'video' }
      else { mediaType = 'file'; resourceType = 'raw' }

      const result = await uploadBuffer(req.file.buffer, {
        folder,
        resource_type: resourceType,
        ...(mime.startsWith('image/') ? { transformation: [{ quality: 'auto', fetch_format: 'auto' }] } : {}),
      })
      mediaUrl = result.secure_url
      mediaName = req.file.originalname
    }

    const message = await GroupMessage.create({
      group: req.params.groupId,
      sender: req.user._id,
      content,
      messageType: req.file ? 'media' : (stickerId ? 'sticker' : messageType),
      mediaUrl,
      mediaType,
      mediaName,
      stickerId,
    })

    await message.populate('sender', 'fullName accountType avatar')

    // Update group's updatedAt so it sorts to top
    group.updatedAt = new Date()
    await group.save()

    // Emit to all members
    const io = getIO()
    if (io) {
      group.members.forEach(memberId => {
        io.to(`user:${memberId}`).emit('group_message', {
          groupId: req.params.groupId,
          message,
        })
      })
    }

    res.status(201).json({ success: true, message })
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to send message.' })
  }
})

// Edit group (admin only) — accepts optional avatar file upload
router.put('/:groupId', protect, upload.single('avatar'), async (req, res) => {
  try {
    const { name, description } = req.body
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    if (!group.admins.some(a => a.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Only admins can edit this group.' })
    }
    if (name?.trim()) group.name = name.trim()
    if (description !== undefined) group.description = description.trim()
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/groups',
        resource_type: 'image',
        transformation: [{ width: 200, height: 200, crop: 'fill', quality: 'auto' }],
      })
      group.avatar = result.secure_url
    }
    await group.save()
    await group.populate('members', 'fullName accountType level avatar isAlumni')
    res.json({ success: true, group })
  } catch {
    res.status(500).json({ message: 'Failed to update group.' })
  }
})

// Leave group (self)
router.post('/:groupId/leave', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    group.members = group.members.filter(m => m.toString() !== req.user._id.toString())
    group.admins  = group.admins.filter(a => a.toString() !== req.user._id.toString())
    await group.save()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to leave group.' })
  }
})

// Delete a single group message (sender or admin)
router.delete('/:groupId/messages/:messageId', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    const msg = await GroupMessage.findById(req.params.messageId)
    if (!msg) return res.status(404).json({ message: 'Message not found.' })
    const isSender = msg.sender.toString() === req.user._id.toString()
    const isAdmin  = group.admins.some(a => a.toString() === req.user._id.toString())
    if (!isSender && !isAdmin) return res.status(403).json({ message: 'Not authorised.' })
    await msg.deleteOne()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to delete message.' })
  }
})

// Add members (admin only)
router.post('/:groupId/members', protect, async (req, res) => {
  try {
    const { memberIds = [] } = req.body
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    if (!group.admins.some(a => a.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Only admins can add members.' })
    }
    const newMembers = memberIds.filter(id => !group.members.some(m => m.toString() === id))
    group.members.push(...newMembers)
    await group.save()
    await group.populate('members', 'fullName accountType level avatar isAlumni')

    const io = getIO()
    if (io) {
      newMembers.forEach(uid => {
        io.to(`user:${uid}`).emit('group_added', {
          group,
          addedBy: { _id: req.user._id, fullName: req.user.fullName },
        })
      })
    }

    res.json({ success: true, group })
  } catch {
    res.status(500).json({ message: 'Failed to add members.' })
  }
})

// Remove member (admin or self-leave)
router.delete('/:groupId/members/:userId', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })

    const isSelf = req.params.userId === req.user._id.toString()
    const isAdmin = group.admins.some(a => a.toString() === req.user._id.toString())
    if (!isSelf && !isAdmin) return res.status(403).json({ message: 'Not authorized.' })

    group.members = group.members.filter(m => m.toString() !== req.params.userId)
    group.admins = group.admins.filter(a => a.toString() !== req.params.userId)
    await group.save()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to remove member.' })
  }
})

// Delete group (creator only)
router.delete('/:groupId', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
    if (!group) return res.status(404).json({ message: 'Group not found.' })
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete this group.' })
    }
    await GroupMessage.deleteMany({ group: req.params.groupId })
    await group.deleteOne()
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to delete group.' })
  }
})

export default router
