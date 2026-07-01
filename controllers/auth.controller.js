import User from '../models/User.model.js'
import Setting from '../models/Setting.model.js'
import { generateTokenAndSetCookie } from '../utils/generateToken.js'

const userPayload = (user) => ({
  _id:              user._id,
  fullName:         user.fullName,
  email:            user.email,
  matricNumber:     user.matricNumber,
  level:            user.level,
  accountType:      user.accountType,
  isLecturer:       user.isLecturer,
  isStaffAdmin:     user.isStaffAdmin,
  isStudentAdmin:   user.isStudentAdmin,
  isActive:         user.isActive,
  isEmailVerified:  user.isEmailVerified,
  avatar:           user.avatar,
  bio:              user.bio,
  isTechMember:     user.isTechMember,
  credits:          user.credits ?? 20,
})

export const register = async (req, res) => {
  try {
    const { fullName, email, password, matricNumber, level, accountType, staffCode } = req.body
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Please fill all required fields.' })
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' })
    }

    const isStaff = accountType === 'staff'
    if (isStaff) {
      if (!staffCode) return res.status(403).json({ message: 'Staff access code is required.' })
      const settings = await Setting.findOne()
      const currentCode = settings?.staffCode || ''
      if (!currentCode) return res.status(403).json({ message: 'Staff registration is currently disabled. Contact an administrator.' })
      if (staffCode !== currentCode) return res.status(403).json({ message: 'Invalid staff access code. Contact an administrator.' })
    }

    const existing = await User.findOne({ email })
    if (existing) return res.status(400).json({ message: 'Email already registered.' })

    const user = await User.create({
      fullName,
      email,
      password,
      matricNumber:    matricNumber || '',
      level:           isStaff ? 'staff' : (level || '100'),
      accountType:     isStaff ? 'staff' : 'student',
      isLecturer:      isStaff,
      isEmailVerified: true,
    })

    const token = generateTokenAndSetCookie(res, user._id)
    res.status(201).json({ success: true, user: userPayload(user), token })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ message: 'Server error during registration.' })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Please provide email and password.' })
    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' })
    if (!user.isActive) return res.status(403).json({ message: 'Your account has been deactivated. Contact an administrator.' })

    const isMatch = await user.comparePassword(password)
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' })

    user.lastSeen = new Date()
    await user.save({ validateBeforeSave: false })
    const token = generateTokenAndSetCookie(res, user._id)
    res.status(200).json({ success: true, user: userPayload(user), token })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Server error during login.' })
  }
}

export const logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie('amacos_token', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 0,
  })
  res.status(200).json({ success: true, message: 'Logged out successfully.' })
}

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password')
    const token = generateTokenAndSetCookie(res, user._id)
    res.status(200).json({ success: true, user, token })
  } catch {
    res.status(500).json({ message: 'Server error.' })
  }
}
