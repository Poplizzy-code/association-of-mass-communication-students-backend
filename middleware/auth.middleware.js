import jwt from 'jsonwebtoken'
import User from '../models/User.model.js'

export const protect = async (req, res, next) => {
  try {
    // Accept token from cookie OR Authorization: Bearer <token> header
    const authHeader = req.headers.authorization
    const token = req.cookies.amacos_token
      || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
    if (!token) return res.status(401).json({ message: 'Not authorized. Please log in.' })
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId).select('-password')
    if (!user) return res.status(401).json({ message: 'User not found.' })
    if (!user.isActive) return res.status(403).json({ message: 'Your account has been deactivated. Contact an administrator.' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

// Any staff member (lecturer or staff admin)
export const staffOnly = (req, res, next) => {
  if (req.user.accountType !== 'staff') {
    return res.status(403).json({ message: 'Staff access only.' })
  }
  next()
}

// Staff with admin privileges
export const staffAdminOnly = (req, res, next) => {
  if (req.user.accountType !== 'staff' || !req.user.isStaffAdmin) {
    return res.status(403).json({ message: 'Staff admin access only.' })
  }
  next()
}

// Student with admin privileges
export const studentAdminOnly = (req, res, next) => {
  if (!req.user.isStudentAdmin) {
    return res.status(403).json({ message: 'Student admin access only.' })
  }
  next()
}

export const techMemberOnly = (req, res, next) => {
  if (!req.user.isTechMember) {
    return res.status(403).json({ message: 'Register for Tech Community to access this.' })
  }
  next()
}

// Backward-compat alias used by admin.routes.js
export const adminOnly = staffAdminOnly
