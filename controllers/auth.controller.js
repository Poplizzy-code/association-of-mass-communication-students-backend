import crypto from 'crypto'
import User from '../models/User.model.js'
import Setting from '../models/Setting.model.js'
import { generateTokenAndSetCookie } from '../utils/generateToken.js'
import { sendVerificationEmail, sendWelcomeEmail } from '../utils/mailer.js'

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
    if (existing) {
      if (!existing.isEmailVerified) {
        return res.status(400).json({
          message: 'This email is registered but not yet verified. Check your inbox or resend the verification email.',
          needsVerification: true,
          email,
        })
      }
      return res.status(400).json({ message: 'Email already registered.' })
    }

    const verifyToken = crypto.randomBytes(32).toString('hex')
    await User.create({
      fullName,
      email,
      password,
      matricNumber:       matricNumber || '',
      level:              isStaff ? 'staff' : (level || '100'),
      accountType:        isStaff ? 'staff' : 'student',
      isLecturer:         isStaff,
      isEmailVerified:    false,
      emailVerifyToken:   verifyToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    sendVerificationEmail(email, fullName, verifyToken).catch(err =>
      console.error('Verification email failed:', err.message)
    )

    res.status(201).json({
      success: true,
      needsVerification: true,
      message: `Account created! We sent a verification link to ${email}. Please check your inbox (and spam folder).`,
    })
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

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
        needsVerification: true,
        email,
      })
    }

    user.lastSeen = new Date()
    await user.save({ validateBeforeSave: false })
    const token = generateTokenAndSetCookie(res, user._id)
    res.status(200).json({ success: true, user: userPayload(user), token })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Server error during login.' })
  }
}

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query
    if (!token) return res.status(400).json({ message: 'Verification token is missing.' })

    const user = await User.findOne({
      emailVerifyToken: token,
      emailVerifyExpires: { $gt: new Date() },
    })
    if (!user) {
      return res.status(400).json({ message: 'This verification link is invalid or has expired. Please request a new one.' })
    }

    user.isEmailVerified    = true
    user.emailVerifyToken   = ''
    user.emailVerifyExpires = undefined
    await user.save({ validateBeforeSave: false })

    sendWelcomeEmail(user.email, user.fullName).catch(() => {})

    const authToken = generateTokenAndSetCookie(res, user._id)
    res.status(200).json({ success: true, user: userPayload(user), token: authToken })
  } catch (error) {
    console.error('Verify email error:', error)
    res.status(500).json({ message: 'Server error during verification.' })
  }
}

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'Email is required.' })

    const user = await User.findOne({ email })
    if (!user) return res.status(404).json({ message: 'No account found with this email.' })
    if (user.isEmailVerified) return res.status(400).json({ message: 'This account is already verified. Please log in.' })

    const verifyToken = crypto.randomBytes(32).toString('hex')
    user.emailVerifyToken   = verifyToken
    user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await user.save({ validateBeforeSave: false })

    await sendVerificationEmail(email, user.fullName, verifyToken)
    res.json({ success: true, message: `Verification email sent to ${email}.` })
  } catch (error) {
    console.error('Resend verification error:', error)
    res.status(500).json({ message: 'Failed to resend verification email.', debug: error.message })
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
