import express from 'express'
import Channel from '../models/Channel.model.js'
import MediaSubscription from '../models/MediaSubscription.model.js'
import { protect, mediaRoleOnly, staffAdminOnly } from '../middleware/auth.middleware.js'
import { uploadMediaImage } from '../utils/cloudinary.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()

const runUpload = (mw) => (req, res, next) => mw(req, res, err => err ? next(err) : next())

const slugify = (str) => str.toLowerCase().trim()
  .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')

// ── Public ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { platform, search, limit = 20, page = 1 } = req.query
    const filter = { isActive: true }
    if (platform) filter.platform = platform
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ]
    const channels = await Channel.find(filter)
      .populate('createdBy', 'fullName avatar')
      .sort({ followersCount: -1, createdAt: -1 })
      .limit(Number(limit)).skip((Number(page) - 1) * Number(limit))
    const total = await Channel.countDocuments(filter)
    res.json({ success: true, channels, total })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.get('/:slug', async (req, res) => {
  try {
    const channel = await Channel.findOne({ slug: req.params.slug, isActive: true })
      .populate('createdBy', 'fullName avatar')
      .populate('members.user', 'fullName avatar mediaRole')
    if (!channel) return res.status(404).json({ message: 'Channel not found.' })
    res.json({ success: true, channel })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Protected ─────────────────────────────────────────────────────────────────

router.post('/', protect, mediaRoleOnly,
  runUpload(uploadMediaImage.fields([{ name: 'logo', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }])),
  async (req, res) => {
    try {
      const { name, description, platform } = req.body
      if (!name || !platform) return res.status(400).json({ message: 'Name and platform are required.' })
      const baseSlug = slugify(name)
      let slug = baseSlug
      let n = 1
      while (await Channel.findOne({ slug })) { slug = `${baseSlug}-${n++}` }

      const logo        = req.files?.logo?.[0]
      const coverImage  = req.files?.coverImage?.[0]
      const channel = await Channel.create({
        name, description: description || '', platform, slug,
        logo:          logo?.path || '',
        logoPublicId:  logo?.filename || '',
        coverImage:    coverImage?.path || '',
        coverPublicId: coverImage?.filename || '',
        createdBy:     req.user._id,
        members:       [{ user: req.user._id, role: 'host' }],
      })
      await channel.populate('createdBy', 'fullName avatar')
      res.status(201).json({ success: true, channel })
    } catch (err) { res.status(500).json({ message: err.message }) }
  }
)

router.put('/:id', protect, mediaRoleOnly,
  runUpload(uploadMediaImage.fields([{ name: 'logo', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }])),
  async (req, res) => {
    try {
      const channel = await Channel.findById(req.params.id)
      if (!channel) return res.status(404).json({ message: 'Channel not found.' })
      const isHost = channel.members.some(m => m.user.toString() === req.user._id.toString() && m.role === 'host')
      const isAdmin = req.user.isStaffAdmin || req.user.isStudentAdmin
      if (!isHost && !isAdmin) return res.status(403).json({ message: 'Only the channel host can edit it.' })

      const { name, description } = req.body
      if (name) channel.name = name
      if (description !== undefined) channel.description = description

      const logo       = req.files?.logo?.[0]
      const coverImage = req.files?.coverImage?.[0]
      if (logo) {
        if (channel.logoPublicId) await cloudinary.uploader.destroy(channel.logoPublicId).catch(() => {})
        channel.logo = logo.path; channel.logoPublicId = logo.filename
      }
      if (coverImage) {
        if (channel.coverPublicId) await cloudinary.uploader.destroy(channel.coverPublicId).catch(() => {})
        channel.coverImage = coverImage.path; channel.coverPublicId = coverImage.filename
      }
      await channel.save()
      res.json({ success: true, channel })
    } catch (err) { res.status(500).json({ message: err.message }) }
  }
)

// Set / clear live status
router.put('/:id/live', protect, mediaRoleOnly, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
    if (!channel) return res.status(404).json({ message: 'Channel not found.' })
    const isMember = channel.members.some(m => m.user.toString() === req.user._id.toString())
    const isAdmin  = req.user.isStaffAdmin || req.user.isStudentAdmin
    if (!isMember && !isAdmin) return res.status(403).json({ message: 'Channel members only.' })

    const { isLive, liveUrl, liveTitle } = req.body
    channel.isLive    = Boolean(isLive)
    channel.liveUrl   = liveUrl   || ''
    channel.liveTitle = liveTitle || ''
    await channel.save()
    res.json({ success: true, channel })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Follow / unfollow a channel
router.post('/:id/follow', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
    if (!channel) return res.status(404).json({ message: 'Channel not found.' })

    const existing = await MediaSubscription.findOne({ user: req.user._id, channel: channel._id })
    if (existing) {
      await existing.deleteOne()
      await Channel.findByIdAndUpdate(channel._id, { $inc: { followersCount: -1 } })
      return res.json({ success: true, following: false })
    }
    await MediaSubscription.create({ user: req.user._id, channel: channel._id })
    await Channel.findByIdAndUpdate(channel._id, { $inc: { followersCount: 1 } })
    res.json({ success: true, following: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Join / leave a channel as member (requires mediaRole)
router.post('/:id/join', protect, mediaRoleOnly, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
    if (!channel) return res.status(404).json({ message: 'Channel not found.' })
    const idx = channel.members.findIndex(m => m.user.toString() === req.user._id.toString())
    if (idx !== -1) {
      if (channel.members[idx].role === 'host') return res.status(400).json({ message: 'Host cannot leave the channel.' })
      channel.members.splice(idx, 1)
      await channel.save()
      return res.json({ success: true, joined: false })
    }
    channel.members.push({ user: req.user._id, role: 'member' })
    await channel.save()
    res.json({ success: true, joined: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Verify channel (staff admin)
router.put('/:id/verify', protect, staffAdminOnly, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true })
    if (!channel) return res.status(404).json({ message: 'Channel not found.' })
    res.json({ success: true, channel })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Delete channel (staff admin only)
router.delete('/:id', protect, staffAdminOnly, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
    if (!channel) return res.status(404).json({ message: 'Channel not found.' })
    if (channel.logoPublicId) await cloudinary.uploader.destroy(channel.logoPublicId).catch(() => {})
    if (channel.coverPublicId) await cloudinary.uploader.destroy(channel.coverPublicId).catch(() => {})
    await channel.deleteOne()
    res.json({ success: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

export default router
