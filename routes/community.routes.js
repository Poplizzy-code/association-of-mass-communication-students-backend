import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import Community from '../models/Community.model.js'
import CommunityMember from '../models/CommunityMember.model.js'
import Notification from '../models/Notification.model.js'
import User from '../models/User.model.js'
import { protect } from '../middleware/auth.middleware.js'
import { getIO } from '../utils/socket.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
    const r = new Readable(); r.push(buffer); r.push(null); r.pipe(stream)
  })

const isPlatformAdmin = (u) => u.isStaffAdmin || u.isStudentAdmin || u.accountType === 'staff'

const isManager = (community, userId) => {
  const id = userId.toString()
  return community.founder.toString() === id ||
    community.moderators.some(m => m.toString() === id)
}

// Plan limits
const PLAN_LIMITS = {
  free:      { images: 2, videos: 0 },
  premium:   { images: 10, videos: 3 },
  unlimited: { images: Infinity, videos: Infinity },
}

// ── List communities ──────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const filter = isPlatformAdmin(req.user) ? {} : { status: 'active' }
    const communities = await Community.find(filter)
      .populate('founder', 'fullName avatar')
      .select('-infoNotes -onboarding.notes -onboarding.questions')
      .sort({ createdAt: -1 })

    const memberships = await CommunityMember.find({ user: req.user._id, status: 'approved' }).select('community')
    const memberSet = new Set(memberships.map(m => m.community.toString()))

    const pending = await CommunityMember.find({ user: req.user._id, status: 'pending' }).select('community')
    const pendingSet = new Set(pending.map(m => m.community.toString()))

    const result = await Promise.all(communities.map(async c => {
      const memberCount = await CommunityMember.countDocuments({ community: c._id, status: 'approved' })
      return {
        ...c.toObject(),
        memberCount,
        isMember: memberSet.has(c._id.toString()),
        isPending: pendingSet.has(c._id.toString()),
        isManager: isManager(c, req.user._id),
      }
    }))
    res.json({ success: true, communities: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load communities.' })
  }
})

// ── Create community ──────────────────────────────────────────────────────
router.post('/', protect, upload.single('coverImage'), async (req, res) => {
  try {
    let coverImage = ''
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/communities/covers',
        resource_type: 'image',
        transformation: [{ width: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      })
      coverImage = result.secure_url
    }

    const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body

    const community = await Community.create({
      ...body,
      coverImage: coverImage || body.coverImage || '',
      founder: req.user._id,
      status: isPlatformAdmin(req.user) ? 'active' : 'pending',
    })
    await community.populate('founder', 'fullName avatar')

    // Auto-approve founder as member
    await CommunityMember.create({
      community: community._id,
      user: req.user._id,
      status: 'approved',
      onboardingCompleted: true,
      approvedAt: new Date(),
    })

    // Notify platform admins if submitted by non-admin
    if (!isPlatformAdmin(req.user)) {
      const admins = await User.find({ $or: [{ isStaffAdmin: true }, { isStudentAdmin: true }] })
      const io = getIO()
      for (const admin of admins) {
        const notif = await Notification.create({
          recipient: admin._id,
          sender: req.user._id,
          type: 'community',
          content: `${req.user.fullName} submitted a new community for approval: "${community.name}"`,
          referenceId: community._id,
          referenceModel: 'Community',
        })
        await notif.populate('sender', 'fullName avatar')
        io?.to(`user:${admin._id}`).emit('notification', notif)
      }
    }

    res.status(201).json({ success: true, community })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Failed to create community.' })
  }
})

// ── Get community detail ──────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
      .populate('founder', 'fullName avatar accountType level')
      .populate('moderators', 'fullName avatar')
    if (!community) return res.status(404).json({ message: 'Not found.' })
    if (community.status !== 'active' && !isPlatformAdmin(req.user) && community.founder._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not available.' })

    const membership = await CommunityMember.findOne({ community: req.params.id, user: req.user._id })
    const memberCount = await CommunityMember.countDocuments({ community: req.params.id, status: 'approved' })

    res.json({
      success: true,
      community,
      membership,
      memberCount,
      isManager: isManager(community, req.user._id),
      isPlatformAdmin: isPlatformAdmin(req.user),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to load community.' })
  }
})

// ── Update community (founder / moderator / platform admin) ──────────────
router.put('/:id', protect, upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'founderAvatar', maxCount: 1 },
  { name: 'infoMedia', maxCount: 20 },
  { name: 'onboardingMedia', maxCount: 20 },
]), async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
    if (!community) return res.status(404).json({ message: 'Not found.' })
    if (!isManager(community, req.user._id) && !isPlatformAdmin(req.user))
      return res.status(403).json({ message: 'Not authorized.' })

    const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body
    const limits = PLAN_LIMITS[community.plan]

    // Cover image
    if (req.files?.coverImage?.[0]) {
      const r = await uploadBuffer(req.files.coverImage[0].buffer, {
        folder: 'amacos/communities/covers',
        resource_type: 'image',
        transformation: [{ width: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      })
      community.coverImage = r.secure_url
    }

    // Founder avatar
    if (req.files?.founderAvatar?.[0]) {
      const r = await uploadBuffer(req.files.founderAvatar[0].buffer, {
        folder: 'amacos/communities/founders',
        resource_type: 'image',
        transformation: [{ width: 400, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      })
      if (!community.founderProfile) community.founderProfile = {}
      community.founderProfile.avatar = r.secure_url
    }

    // Upload new info media files
    const newInfoMediaFiles = req.files?.infoMedia || []
    const uploadedInfoMedia = []
    for (const file of newInfoMediaFiles) {
      const isVideo = file.mimetype.startsWith('video/')
      const existingImages = (body.infoMedia || community.infoMedia).filter(m => m.kind === 'image').length
      const existingVideos = (body.infoMedia || community.infoMedia).filter(m => m.kind === 'video').length
      if (!isVideo && existingImages >= limits.images) continue
      if (isVideo && limits.videos === 0) continue
      if (isVideo && existingVideos >= limits.videos) continue
      const r = await uploadBuffer(file.buffer, {
        folder: 'amacos/communities/media',
        resource_type: isVideo ? 'video' : 'image',
        transformation: isVideo ? [] : [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      })
      uploadedInfoMedia.push({ kind: isVideo ? 'video' : 'image', url: r.secure_url, caption: '', order: 999 })
    }

    // Upload new onboarding media files
    const newOnbMediaFiles = req.files?.onboardingMedia || []
    const uploadedOnbMedia = []
    for (const file of newOnbMediaFiles) {
      const isVideo = file.mimetype.startsWith('video/')
      if (isVideo && limits.videos === 0) continue
      const r = await uploadBuffer(file.buffer, {
        folder: 'amacos/communities/onboarding',
        resource_type: isVideo ? 'video' : 'image',
        transformation: isVideo ? [] : [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
      })
      uploadedOnbMedia.push({ kind: isVideo ? 'video' : 'image', url: r.secure_url, caption: '', order: 999 })
    }

    // Apply body fields
    const ALLOWED = ['name', 'description', 'type', 'joinMode', 'prerequisites',
      'groupChatLink', 'infoNotes', 'founderProfile', 'onboarding', 'upgradeRequested']
    for (const key of ALLOWED) {
      if (key in body) community[key] = body[key]
    }

    // Merge uploaded media into existing arrays
    if (body.infoMedia !== undefined) {
      community.infoMedia = [...(body.infoMedia || []), ...uploadedInfoMedia]
    } else {
      community.infoMedia = [...community.infoMedia, ...uploadedInfoMedia]
    }
    if (body.onboarding?.media !== undefined || uploadedOnbMedia.length) {
      const base = body.onboarding?.media || community.onboarding?.media || []
      if (!community.onboarding) community.onboarding = {}
      community.onboarding.media = [...base, ...uploadedOnbMedia]
    }

    // Platform admin can change status and plan
    if (isPlatformAdmin(req.user)) {
      if (body.status) community.status = body.status
      if (body.plan)   { community.plan = body.plan; community.upgradeRequested = false }
      if (body.adminNote !== undefined) community.adminNote = body.adminNote
    }

    community.markModified('founderProfile')
    community.markModified('onboarding')
    community.markModified('infoMedia')
    await community.save()
    await community.populate('founder', 'fullName avatar accountType level')
    await community.populate('moderators', 'fullName avatar')

    res.json({ success: true, community })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Failed to update.' })
  }
})

// ── Delete community (founder or platform admin) ──────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
    if (!community) return res.status(404).json({ message: 'Not found.' })
    if (community.founder.toString() !== req.user._id.toString() && !isPlatformAdmin(req.user))
      return res.status(403).json({ message: 'Not authorized.' })
    await CommunityMember.deleteMany({ community: req.params.id })
    await community.deleteOne()
    res.json({ success: true })
  } catch (err) { res.status(500).json({ message: 'Failed to delete.' }) }
})

// ── Submit join application ───────────────────────────────────────────────
router.post('/:id/join', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
    if (!community) return res.status(404).json({ message: 'Not found.' })
    if (community.status !== 'active') return res.status(400).json({ message: 'Community is not active.' })

    const existing = await CommunityMember.findOne({ community: req.params.id, user: req.user._id })
    if (existing) return res.status(400).json({ message: 'You have already applied or are a member.' })

    const { joinMessage, onboardingAnswers } = req.body
    let onboardingScore = 0
    let onboardingCompleted = false

    if (community.onboarding?.enabled) {
      if (!onboardingAnswers?.length) return res.status(400).json({ message: 'Complete the onboarding first.' })
      onboardingCompleted = true

      // Score MCQ answers
      const questions = community.onboarding.questions
      let correct = 0; let total = 0
      for (const q of questions) {
        if (q.type === 'mcq' && q.correctAnswer) {
          total++
          const ans = onboardingAnswers.find(a => a.questionId?.toString() === q._id.toString())
          if (ans?.answer === q.correctAnswer) correct++
        }
      }
      onboardingScore = correct
      if (total > 0 && community.onboarding.passingScore > 0 && correct < community.onboarding.passingScore) {
        return res.status(400).json({
          message: 'You did not pass the onboarding assessment.',
          score: correct,
          passing: community.onboarding.passingScore,
          feedbackMode: community.onboarding.feedbackMode,
          wrongQuestions: community.onboarding.feedbackMode === 'show_wrong'
            ? questions
                .filter(q => q.type === 'mcq' && q.correctAnswer)
                .map(q => {
                  const ans = onboardingAnswers.find(a => a.questionId?.toString() === q._id.toString())
                  return { questionId: q._id, passed: ans?.answer === q.correctAnswer }
                })
            : undefined,
        })
      }
    }

    const autoApprove = community.joinMode === 'open'
    const member = await CommunityMember.create({
      community: req.params.id,
      user: req.user._id,
      status: autoApprove ? 'approved' : 'pending',
      joinMessage: joinMessage?.trim() || '',
      onboardingCompleted,
      onboardingAnswers: onboardingAnswers || [],
      onboardingScore,
      approvedAt: autoApprove ? new Date() : undefined,
    })

    // Notify founder + moderators if approval mode
    if (!autoApprove) {
      const io = getIO()
      const managers = [community.founder, ...community.moderators]
      for (const managerId of managers) {
        const notif = await Notification.create({
          recipient: managerId,
          sender: req.user._id,
          type: 'community',
          content: `${req.user.fullName} applied to join "${community.name}"`,
          referenceId: community._id,
          referenceModel: 'Community',
        })
        await notif.populate('sender', 'fullName avatar')
        io?.to(`user:${managerId}`).emit('notification', notif)
      }
    }

    res.status(201).json({ success: true, member, autoApproved: autoApprove })
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'You have already applied.' })
    console.error(err)
    res.status(500).json({ message: 'Failed to submit application.' })
  }
})

// ── Get members (manager/admin) ───────────────────────────────────────────
router.get('/:id/members', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
    if (!community) return res.status(404).json({ message: 'Not found.' })
    if (!isManager(community, req.user._id) && !isPlatformAdmin(req.user))
      return res.status(403).json({ message: 'Not authorized.' })
    const members = await CommunityMember.find({ community: req.params.id })
      .populate('user', 'fullName avatar level accountType')
      .sort({ createdAt: -1 })
    res.json({ success: true, members })
  } catch { res.status(500).json({ message: 'Failed to load members.' }) }
})

// ── Approve / reject member ───────────────────────────────────────────────
router.put('/:id/members/:uid', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
    if (!community) return res.status(404).json({ message: 'Not found.' })
    if (!isManager(community, req.user._id) && !isPlatformAdmin(req.user))
      return res.status(403).json({ message: 'Not authorized.' })

    const { status, adminNote } = req.body
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status.' })

    const member = await CommunityMember.findOne({ community: req.params.id, user: req.params.uid })
      .populate('user', 'fullName avatar')
    if (!member) return res.status(404).json({ message: 'Application not found.' })

    member.status = status
    member.adminNote = adminNote?.trim() || ''
    if (status === 'approved') member.approvedAt = new Date()
    await member.save()

    const content = status === 'approved'
      ? `Your application to join "${community.name}" has been approved! 🎉`
      : `Your application to join "${community.name}" was not approved.${adminNote ? ` Note: ${adminNote}` : ''}`

    const notif = await Notification.create({
      recipient: member.user._id,
      sender: req.user._id,
      type: 'community',
      content,
      referenceId: community._id,
      referenceModel: 'Community',
    })
    await notif.populate('sender', 'fullName avatar')
    getIO()?.to(`user:${member.user._id}`).emit('notification', notif)

    res.json({ success: true, member })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to update member.' })
  }
})

// ── Remove member ─────────────────────────────────────────────────────────
router.delete('/:id/members/:uid', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
    if (!community) return res.status(404).json({ message: 'Not found.' })
    const isSelf = req.user._id.toString() === req.params.uid
    if (!isSelf && !isManager(community, req.user._id) && !isPlatformAdmin(req.user))
      return res.status(403).json({ message: 'Not authorized.' })
    await CommunityMember.findOneAndDelete({ community: req.params.id, user: req.params.uid })
    res.json({ success: true })
  } catch { res.status(500).json({ message: 'Failed to remove member.' }) }
})

// ── Assign / remove moderator (founder only) ──────────────────────────────
router.put('/:id/moderators', protect, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
    if (!community) return res.status(404).json({ message: 'Not found.' })
    if (community.founder.toString() !== req.user._id.toString() && !isPlatformAdmin(req.user))
      return res.status(403).json({ message: 'Only the founder can manage moderators.' })
    const { userId, action } = req.body
    if (action === 'add') {
      if (!community.moderators.map(m => m.toString()).includes(userId))
        community.moderators.push(userId)
    } else {
      community.moderators = community.moderators.filter(m => m.toString() !== userId)
    }
    await community.save()
    await community.populate('moderators', 'fullName avatar')
    res.json({ success: true, moderators: community.moderators })
  } catch { res.status(500).json({ message: 'Failed to update moderators.' }) }
})

export default router
