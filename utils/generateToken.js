import jwt from 'jsonwebtoken'

export const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  })
  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie('amacos_token', token, {
    httpOnly: true,
    secure: isProduction,
    // 'none' is required for cross-origin requests (client and server on different subdomains)
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
  return token
}
