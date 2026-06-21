import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import AlumniProfile from '../models/AlumniProfile.model.js'
import AlumniOpportunity from '../models/AlumniOpportunity.model.js'
import Notification from '../models/Notification.model.js'
import { protect } from '../middleware/auth.middleware.js'
import { getIO } from '../utils/socket.js'
import cloudinary from '../utils/cloudinary.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
    const readable = new Readable()
    readable.push(buffer)
    readable.push(null)
    readable.pipe(stream)
  })

const isAdmin = (user) => user?.isStaffAdmin || user?.isStudentAdmin || user?.accountType === 'staff'

// ── Profiles ─────────────────────────────────────────────────────────────────

// GET /profiles — list approved
router.get('/profiles', protect, async (req, res) => {
  try {
    const { field, mentorship, search, year } = req.query
    const filter = { status: 'approved' }
    if (field && field !== 'all') filter.field = field
    if (mentorship === 'true') filter.openToMentorship = true
    if (year) filter.graduationYear = Number(year)
    if (search) filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { currentRole: { $regex: search, $options: 'i' } },
      { currentCompany: { $regex: search, $options: 'i' } },
    ]

    const profiles = await AlumniProfile.find(filter)
      .sort({ graduationYear: -1, createdAt: -1 })
      .limit(100)

    res.json({ profiles })
  } catch (err) { res.status(500).json({ message: 'Failed to load profiles.' }) }
})

// GET /profiles/mine — my own profile (auto-creates for alumni if missing)
router.get('/profiles/mine', protect, async (req, res) => {
  try {
    let profile = await AlumniProfile.findOne({ user: req.user._id })

    // Auto-generate from user account if alumni but no profile yet
    if (!profile && req.user.isAlumni) {
      profile = await AlumniProfile.create({
        user: req.user._id,
        submittedBy: req.user._id,
        fullName: req.user.fullName,
        avatar: req.user.avatar || '',
        graduationYear: new Date().getFullYear(),
        field: 'other',
        status: 'approved',
      })
    }

    const opportunities = profile
      ? await AlumniOpportunity.find({ postedBy: req.user._id }).sort({ createdAt: -1 })
      : []
    res.json({ profile, opportunities })
  } catch { res.status(500).json({ message: 'Failed.' }) }
})

// POST /profiles — create profile
router.post('/profiles', protect, upload.single('avatar'), async (req, res) => {
  try {
    const existing = await AlumniProfile.findOne({ user: req.user._id })
    if (existing) return res.status(400).json({ message: 'You already have a profile.' })

    const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body
    const { fullName, graduationYear, field, currentRole, currentCompany, location, bio, achievements, openToMentorship, contact } = body

    if (!fullName?.trim()) return res.status(400).json({ message: 'Full name is required.' })
    if (!graduationYear) return res.status(400).json({ message: 'Graduation year is required.' })

    let avatar = req.user.avatar || ''
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/alumni',
        resource_type: 'image',
        transformation: [{ width: 300, height: 300, crop: 'fill', quality: 'auto' }],
      })
      avatar = result.secure_url
    }

    const autoApprove = req.user.isAlumni || isAdmin(req.user)

    const profile = await AlumniProfile.create({
      user: req.user._id,
      submittedBy: req.user._id,
      fullName: fullName.trim(),
      avatar,
      graduationYear: Number(graduationYear),
      field: field || 'other',
      currentRole: currentRole?.trim() || '',
      currentCompany: currentCompany?.trim() || '',
      location: location?.trim() || '',
      bio: bio?.trim() || '',
      achievements: (achievements || []).filter(a => a?.trim()),
      openToMentorship: !!openToMentorship,
      contact: contact || {},
      status: autoApprove ? 'approved' : 'pending',
    })

    if (!autoApprove) {
      const admins = await (await import('../models/User.model.js')).default.find({ $or: [{ isStaffAdmin: true }, { accountType: 'staff' }] }).select('_id')
      const io = getIO()
      for (const admin of admins) {
        await Notification.create({
          recipient: admin._id,
          sender: req.user._id,
          type: 'election',
          content: `${req.user.fullName} submitted an alumni profile for approval`,
          referenceId: profile._id,
          referenceModel: 'Post',
        })
        io?.to(`user:${admin._id}`).emit('notification', { count: 1 })
      }
    }

    res.status(201).json({ profile, autoApproved: autoApprove })
  } catch (err) { res.status(500).json({ message: err.message || 'Failed to create profile.' }) }
})

// GET /profiles/:id
router.get('/profiles/:id', protect, async (req, res) => {
  try {
    const profile = await AlumniProfile.findById(req.params.id).populate('user', 'fullName avatar')
    if (!profile) return res.status(404).json({ message: 'Profile not found.' })
    if (profile.status !== 'approved' && !isAdmin(req.user) && profile.user?._id?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not available.' })
    }
    const opportunities = await AlumniOpportunity.find({ postedBy: profile.user, approved: true, status: 'active' }).sort({ createdAt: -1 })
    res.json({ profile, opportunities })
  } catch { res.status(500).json({ message: 'Failed.' }) }
})

// PUT /profiles/:id — edit own or admin
router.put('/profiles/:id', protect, upload.single('avatar'), async (req, res) => {
  try {
    const profile = await AlumniProfile.findById(req.params.id)
    if (!profile) return res.status(404).json({ message: 'Not found.' })
    const isOwner = profile.user?.toString() === req.user._id.toString()
    if (!isOwner && !isAdmin(req.user)) return res.status(403).json({ message: 'Not authorised.' })

    const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body

    const FIELDS = ['fullName', 'graduationYear', 'field', 'currentRole', 'currentCompany', 'location', 'bio', 'openToMentorship', 'status']
    for (const f of FIELDS) {
      if (f in body) profile[f] = body[f]
    }
    if (body.achievements) profile.achievements = body.achievements.filter(a => a?.trim())
    if (body.contact) { profile.contact = { ...profile.contact, ...body.contact }; profile.markModified('contact') }

    if (req.file) {
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/alumni',
        resource_type: 'image',
        transformation: [{ width: 300, height: 300, crop: 'fill', quality: 'auto' }],
      })
      profile.avatar = result.secure_url
    }

    await profile.save()
    res.json({ profile })
  } catch (err) { res.status(500).json({ message: err.message || 'Failed.' }) }
})

// DELETE /profiles/:id
router.delete('/profiles/:id', protect, async (req, res) => {
  try {
    const profile = await AlumniProfile.findById(req.params.id)
    if (!profile) return res.status(404).json({ message: 'Not found.' })
    const isOwner = profile.user?.toString() === req.user._id.toString()
    if (!isOwner && !isAdmin(req.user)) return res.status(403).json({ message: 'Not authorised.' })
    await profile.deleteOne()
    res.json({ success: true })
  } catch { res.status(500).json({ message: 'Failed.' }) }
})

// POST /profiles/:id/mentorship — send mentorship request notification
router.post('/profiles/:id/mentorship', protect, async (req, res) => {
  try {
    const profile = await AlumniProfile.findById(req.params.id)
    if (!profile) return res.status(404).json({ message: 'Not found.' })
    if (!profile.openToMentorship) return res.status(400).json({ message: 'This alumni is not open to mentorship.' })
    if (!profile.user) return res.status(400).json({ message: 'No linked account for this alumni.' })

    const { message } = req.body
    await Notification.create({
      recipient: profile.user,
      sender: req.user._id,
      type: 'message',
      content: `${req.user.fullName} sent you a mentorship request: "${message || 'I would love to connect!'}"`,
    })
    getIO()?.to(`user:${profile.user}`).emit('notification', { count: 1 })

    res.json({ success: true })
  } catch { res.status(500).json({ message: 'Failed to send request.' }) }
})

// ── Opportunities ─────────────────────────────────────────────────────────────

// GET /opportunities
router.get('/opportunities', protect, async (req, res) => {
  try {
    const { type, search } = req.query
    const filter = { approved: true, status: 'active' }
    if (type && type !== 'all') filter.type = type
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ]

    const opportunities = await AlumniOpportunity.find(filter)
      .populate('postedBy', 'fullName avatar')
      .populate('alumniProfile', 'fullName avatar currentRole currentCompany')
      .sort({ createdAt: -1 })
      .limit(100)

    res.json({ opportunities })
  } catch { res.status(500).json({ message: 'Failed to load opportunities.' }) }
})

// POST /opportunities
router.post('/opportunities', protect, async (req, res) => {
  try {
    const profile = await AlumniProfile.findOne({ user: req.user._id, status: 'approved' })
    if (!profile && !isAdmin(req.user)) {
      return res.status(403).json({ message: 'You need an approved alumni profile to post opportunities.' })
    }

    const { type, title, company, description, requirements, locationType, city, deadline, applyLink, applyEmail } = req.body
    if (!type || !title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Type, title, and description are required.' })
    }

    const opp = await AlumniOpportunity.create({
      postedBy: req.user._id,
      alumniProfile: profile?._id,
      type,
      title: title.trim(),
      company: company?.trim() || '',
      description: description.trim(),
      requirements: (requirements || []).filter(r => r?.trim()),
      locationType: locationType || 'onsite',
      city: city?.trim() || '',
      deadline: deadline ? new Date(deadline) : undefined,
      applyLink: applyLink?.trim() || '',
      applyEmail: applyEmail?.trim() || '',
      approved: isAdmin(req.user),
    })

    await opp.populate('postedBy', 'fullName avatar')
    await opp.populate('alumniProfile', 'fullName avatar currentRole currentCompany')

    res.status(201).json({ opportunity: opp })
  } catch (err) { res.status(500).json({ message: err.message || 'Failed.' }) }
})

// PUT /opportunities/:id
router.put('/opportunities/:id', protect, async (req, res) => {
  try {
    const opp = await AlumniOpportunity.findById(req.params.id)
    if (!opp) return res.status(404).json({ message: 'Not found.' })
    const isOwner = opp.postedBy.toString() === req.user._id.toString()
    if (!isOwner && !isAdmin(req.user)) return res.status(403).json({ message: 'Not authorised.' })

    const FIELDS = ['type', 'title', 'company', 'description', 'locationType', 'city', 'applyLink', 'applyEmail', 'status', 'approved']
    for (const f of FIELDS) {
      if (f in req.body) opp[f] = req.body[f]
    }
    if (req.body.requirements) opp.requirements = req.body.requirements.filter(r => r?.trim())
    if (req.body.deadline !== undefined) opp.deadline = req.body.deadline ? new Date(req.body.deadline) : undefined

    await opp.save()
    await opp.populate('postedBy', 'fullName avatar')
    await opp.populate('alumniProfile', 'fullName avatar currentRole currentCompany')
    res.json({ opportunity: opp })
  } catch (err) { res.status(500).json({ message: err.message || 'Failed.' }) }
})

// DELETE /opportunities/:id
router.delete('/opportunities/:id', protect, async (req, res) => {
  try {
    const opp = await AlumniOpportunity.findById(req.params.id)
    if (!opp) return res.status(404).json({ message: 'Not found.' })
    const isOwner = opp.postedBy.toString() === req.user._id.toString()
    if (!isOwner && !isAdmin(req.user)) return res.status(403).json({ message: 'Not authorised.' })
    await opp.deleteOne()
    res.json({ success: true })
  } catch { res.status(500).json({ message: 'Failed.' }) }
})

// ── Admin pending ─────────────────────────────────────────────────────────────

// GET /admin/pending
router.get('/admin/pending', protect, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admins only.' })
    const [profiles, opportunities] = await Promise.all([
      AlumniProfile.find({ status: 'pending' }).sort({ createdAt: 1 }),
      AlumniOpportunity.find({ approved: false }).populate('postedBy', 'fullName avatar').sort({ createdAt: 1 }),
    ])
    res.json({ profiles, opportunities })
  } catch { res.status(500).json({ message: 'Failed.' }) }
})

export default router
