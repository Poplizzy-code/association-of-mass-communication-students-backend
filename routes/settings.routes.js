import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import User from '../models/User.model.js'
import Setting from '../models/Setting.model.js'
import cloudinary from '../utils/cloudinary.js'
import { protect, staffAdminOnly, studentAdminOnly } from '../middleware/auth.middleware.js'

const router = express.Router()
router.use(protect)

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

// ── Personal settings (all authenticated users) ─────────────────────────────

router.put('/personal', async (req, res) => {
  try {
    const { fullName, bio } = req.body
    const updates = {}
    if (fullName?.trim()) updates.fullName = fullName.trim()
    if (bio !== undefined) updates.bio = bio
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password')
    res.json({ success: true, user })
  } catch {
    res.status(500).json({ message: 'Failed to update profile.' })
  }
})

router.put('/personal/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided.' })
    const result = await uploadBuffer(req.file.buffer, {
      folder: 'amacos/avatars',
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }, { quality: 'auto', fetch_format: 'auto' }],
    })
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: result.secure_url },
      { new: true }
    ).select('-password')
    res.json({ success: true, user })
  } catch {
    res.status(500).json({ message: 'Failed to upload avatar.' })
  }
})

router.put('/personal/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Both passwords are required.' })
    if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters.' })
    const user = await User.findById(req.user._id)
    const match = await user.comparePassword(currentPassword)
    if (!match) return res.status(400).json({ message: 'Current password is incorrect.' })
    user.password = newPassword
    await user.save()
    res.json({ success: true, message: 'Password updated.' })
  } catch {
    res.status(500).json({ message: 'Failed to update password.' })
  }
})

// ── Staff settings (staff admin only) ──────────────────────────────────────

router.get('/staff', staffAdminOnly, async (req, res) => {
  try {
    const [settings, staff] = await Promise.all([
      Setting.findOne(),
      User.find({ accountType: 'staff' }).select('-password').sort({ createdAt: 1 }),
    ])
    res.json({ success: true, staffCode: settings?.staffCode || '', staff })
  } catch {
    res.status(500).json({ message: 'Failed to load staff settings.' })
  }
})

router.put('/staff/code', staffAdminOnly, async (req, res) => {
  try {
    const { staffCode } = req.body
    if (!staffCode?.trim()) return res.status(400).json({ message: 'Code cannot be empty.' })
    const settings = await Setting.findOneAndUpdate(
      {},
      { staffCode: staffCode.trim() },
      { new: true, upsert: true }
    )
    res.json({ success: true, staffCode: settings.staffCode })
  } catch {
    res.status(500).json({ message: 'Failed to update staff code.' })
  }
})

// Update a staff member's roles (isLecturer, isStaffAdmin)
router.put('/staff/:id', staffAdminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot modify your own roles.' })
    }
    const { isLecturer, isStaffAdmin } = req.body
    const user = await User.findOne({ _id: req.params.id, accountType: 'staff' })
    if (!user) return res.status(404).json({ message: 'Staff member not found.' })
    if (isLecturer !== undefined) user.isLecturer = Boolean(isLecturer)
    if (isStaffAdmin !== undefined) user.isStaffAdmin = Boolean(isStaffAdmin)
    await user.save()
    const updated = user.toObject()
    delete updated.password
    res.json({ success: true, user: updated })
  } catch {
    res.status(500).json({ message: 'Failed to update staff member.' })
  }
})

// Activate / deactivate a staff account
router.put('/staff/:id/toggle-active', staffAdminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' })
    }
    const user = await User.findOne({ _id: req.params.id, accountType: 'staff' })
    if (!user) return res.status(404).json({ message: 'Staff member not found.' })
    user.isActive = !user.isActive
    await user.save()
    const updated = user.toObject()
    delete updated.password
    res.json({ success: true, user: updated })
  } catch {
    res.status(500).json({ message: 'Failed to update account status.' })
  }
})

// ── Student settings (student admin only) ──────────────────────────────────

router.get('/students', studentAdminOnly, async (req, res) => {
  try {
    const students = await User.find({ accountType: 'student' }).select('-password').sort({ fullName: 1 })
    res.json({ success: true, students })
  } catch {
    res.status(500).json({ message: 'Failed to load students.' })
  }
})

// Update a student's roles (isStudentAdmin)
router.put('/students/:id', studentAdminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot modify your own roles.' })
    }
    const { isStudentAdmin } = req.body
    const user = await User.findOne({ _id: req.params.id, accountType: 'student' })
    if (!user) return res.status(404).json({ message: 'Student not found.' })
    if (isStudentAdmin !== undefined) user.isStudentAdmin = Boolean(isStudentAdmin)
    await user.save()
    const updated = user.toObject()
    delete updated.password
    res.json({ success: true, user: updated })
  } catch {
    res.status(500).json({ message: 'Failed to update student.' })
  }
})

// Activate / deactivate a student account
router.put('/students/:id/toggle-active', studentAdminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' })
    }
    const user = await User.findOne({ _id: req.params.id, accountType: 'student' })
    if (!user) return res.status(404).json({ message: 'Student not found.' })
    user.isActive = !user.isActive
    await user.save()
    const updated = user.toObject()
    delete updated.password
    res.json({ success: true, user: updated })
  } catch {
    res.status(500).json({ message: 'Failed to update account status.' })
  }
})

// Set a specific student's level (for repeating students)
router.put('/students/:id/level', staffAdminOnly, async (req, res) => {
  try {
    const { level } = req.body
    const validLevels = ['100', '200', '300', '400']
    if (!validLevels.includes(level)) {
      return res.status(400).json({ message: 'Invalid level. Must be 100, 200, 300, or 400.' })
    }
    const user = await User.findOne({ _id: req.params.id, accountType: 'student' })
    if (!user) return res.status(404).json({ message: 'Student not found.' })
    user.level = level
    await user.save()
    const updated = user.toObject()
    delete updated.password
    res.json({ success: true, user: updated })
  } catch {
    res.status(500).json({ message: 'Failed to update student level.' })
  }
})

// ── Session management (staff admin only) ──────────────────────────────────

router.get('/session', staffAdminOnly, async (req, res) => {
  try {
    const settings = await Setting.findOne()
    res.json({ success: true, currentSession: settings?.currentSession || '' })
  } catch {
    res.status(500).json({ message: 'Failed to load session.' })
  }
})

router.put('/session', staffAdminOnly, async (req, res) => {
  try {
    const { currentSession } = req.body
    if (!currentSession?.trim()) return res.status(400).json({ message: 'Session cannot be empty.' })
    const settings = await Setting.findOneAndUpdate(
      {},
      { currentSession: currentSession.trim() },
      { new: true, upsert: true }
    )
    res.json({ success: true, currentSession: settings.currentSession })
  } catch {
    res.status(500).json({ message: 'Failed to update session.' })
  }
})

// Promote all students by one level (100→200, 200→300, 300→400; 400L stays)
router.put('/session/promote', staffAdminOnly, async (req, res) => {
  try {
    const promotions = [
      { from: '300', to: '400' },
      { from: '200', to: '300' },
      { from: '100', to: '200' },
    ]
    let totalPromoted = 0
    for (const { from, to } of promotions) {
      const result = await User.updateMany(
        { accountType: 'student', level: from },
        { $set: { level: to } }
      )
      totalPromoted += result.modifiedCount
    }
    res.json({ success: true, totalPromoted, message: `${totalPromoted} students promoted.` })
  } catch {
    res.status(500).json({ message: 'Failed to promote students.' })
  }
})

export default router
