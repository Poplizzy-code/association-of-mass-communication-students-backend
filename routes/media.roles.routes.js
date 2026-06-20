import express from 'express'
import User from '../models/User.model.js'
import { protect, studentAdminOnly, staffAdminOnly } from '../middleware/auth.middleware.js'

const router = express.Router()

// Any student admin or staff admin can manage media roles
const adminGate = (req, res, next) => {
  if (req.user.isStudentAdmin || req.user.isStaffAdmin) return next()
  return res.status(403).json({ message: 'Admin access required to manage media roles.' })
}

// GET all users who have a media role
router.get('/', protect, adminGate, async (req, res) => {
  try {
    const users = await User.find({ mediaRole: { $ne: '' } })
      .select('fullName email avatar level accountType mediaRole')
      .sort({ mediaRole: 1, fullName: 1 })
    res.json({ success: true, users })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// GET all students/staff (for role assignment picker)
router.get('/all', protect, adminGate, async (req, res) => {
  try {
    const { search } = req.query
    const filter = {}
    if (search) filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email:    { $regex: search, $options: 'i' } },
    ]
    const users = await User.find(filter)
      .select('fullName email avatar level accountType mediaRole matricNumber')
      .sort({ fullName: 1 })
      .limit(50)
    res.json({ success: true, users })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// PUT assign / remove media role for a user
router.put('/:userId', protect, adminGate, async (req, res) => {
  try {
    const { mediaRole } = req.body
    const valid = ['', 'publisher', 'editor', 'chief-editor']
    if (!valid.includes(mediaRole)) return res.status(400).json({ message: 'Invalid media role.' })

    // Only staff admins can assign chief-editor
    if (mediaRole === 'chief-editor' && !req.user.isStaffAdmin) {
      return res.status(403).json({ message: 'Only staff admins can assign the chief-editor role.' })
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { mediaRole },
      { new: true }
    ).select('fullName email avatar level accountType mediaRole')
    if (!user) return res.status(404).json({ message: 'User not found.' })
    res.json({ success: true, user })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

export default router
