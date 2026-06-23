import express from 'express'
import User from '../models/User.model.js'
import Setting from '../models/Setting.model.js'
import CreditRequest from '../models/CreditRequest.model.js'
import CreditTransaction from '../models/CreditTransaction.model.js'
import Notification from '../models/Notification.model.js'
import { protect, staffAdminOnly, studentAdminOnly } from '../middleware/auth.middleware.js'
import { io } from '../index.js'

const router = express.Router()
router.use(protect)

const isAdmin = (user) => user?.isStaffAdmin || user?.isStudentAdmin || user?.accountType === 'staff'

// ── Bank info (public to all logged-in users) ─────────────────────────────────
router.get('/bank-info', async (req, res) => {
  try {
    const settings = await Setting.findOne().lean()
    res.json({
      bankName: settings?.bankName || '',
      bankAccountNumber: settings?.bankAccountNumber || '',
      bankAccountName: settings?.bankAccountName || '',
      creditPackages: settings?.creditPackages || [],
    })
  } catch {
    res.status(500).json({ message: 'Failed to load payment info.' })
  }
})

// ── Wallet: balance + recent transactions ─────────────────────────────────────
router.get('/wallet', async (req, res) => {
  try {
    const [user, transactions, pendingRequest] = await Promise.all([
      User.findById(req.user._id).select('credits fullName').lean(),
      CreditTransaction.find({ user: req.user._id })
        .sort({ createdAt: -1 }).limit(30)
        .populate('peer', 'fullName avatar').lean(),
      CreditRequest.findOne({ user: req.user._id, status: 'pending' }).lean(),
    ])
    res.json({ credits: user.credits, transactions, pendingRequest })
  } catch {
    res.status(500).json({ message: 'Failed to load wallet.' })
  }
})

// ── Submit a top-up request (student pays manually, waits for approval) ───────
router.post('/request', async (req, res) => {
  try {
    const { naira, note } = req.body
    if (!naira || naira <= 0) return res.status(400).json({ message: 'Invalid amount.' })

    // Prevent duplicate pending requests
    const existing = await CreditRequest.findOne({ user: req.user._id, status: 'pending' })
    if (existing) return res.status(400).json({ message: 'You already have a pending request. Wait for it to be reviewed.' })

    // Determine credits from packages
    const settings = await Setting.findOne().lean()
    const packages = settings?.creditPackages || []
    const pkg = packages.find(p => p.naira === Number(naira))
    const credits = pkg ? pkg.credits : Math.floor(Number(naira) / 4) // fallback: ₦4 = 1 credit

    const request = await CreditRequest.create({
      user: req.user._id,
      naira: Number(naira),
      credits,
      note: note?.trim() || '',
    })

    // Notify all admins
    const admins = await User.find({
      $or: [{ isStaffAdmin: true }, { isStudentAdmin: true }],
    }).select('_id').lean()

    await Promise.all(admins.map(async (admin) => {
      const notif = await Notification.create({
        recipient: admin._id,
        sender: req.user._id,
        type: 'community', // reusing closest type
        content: `${req.user.fullName} submitted a credit top-up request for ₦${naira} (${credits} credits).`,
        referenceId: request._id,
        referenceModel: 'Community',
      })
      await notif.populate('sender', 'fullName avatar')
      io?.to(`user:${admin._id}`).emit('notification', notif)
    }))

    res.status(201).json({ success: true, request })
  } catch (err) {
    res.status(500).json({ message: 'Failed to submit request.', error: err.message })
  }
})

// ── Admin: list credit requests ───────────────────────────────────────────────
router.get('/requests', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admins only.' })
  try {
    const { status = 'pending' } = req.query
    const filter = status === 'all' ? {} : { status }
    const requests = await CreditRequest.find(filter)
      .populate('user', 'fullName avatar email level accountType')
      .populate('reviewedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(100).lean()
    res.json({ requests })
  } catch {
    res.status(500).json({ message: 'Failed to load requests.' })
  }
})

// ── Admin: approve a request ──────────────────────────────────────────────────
router.patch('/requests/:id/approve', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admins only.' })
  try {
    const request = await CreditRequest.findById(req.params.id).populate('user')
    if (!request) return res.status(404).json({ message: 'Request not found.' })
    if (request.status !== 'pending') return res.status(400).json({ message: 'Request already reviewed.' })

    // Credit the user
    const updatedUser = await User.findByIdAndUpdate(
      request.user._id,
      { $inc: { credits: request.credits } },
      { new: true }
    )

    // Record transaction
    await CreditTransaction.create({
      user: request.user._id,
      type: 'topup',
      amount: request.credits,
      balance: updatedUser.credits,
      note: `Top-up approved: ₦${request.naira} → ${request.credits} credits`,
      ref: request._id,
      refModel: 'CreditRequest',
    })

    // Mark request approved
    request.status = 'approved'
    request.reviewedBy = req.user._id
    request.reviewedAt = new Date()
    await request.save()

    // Notify the student
    const notif = await Notification.create({
      recipient: request.user._id,
      sender: req.user._id,
      type: 'community',
      content: `✅ Your credit top-up of ${request.credits} credits has been approved! Your balance is now ${updatedUser.credits} credits.`,
      referenceId: request._id,
      referenceModel: 'Community',
    })
    await notif.populate('sender', 'fullName avatar')
    io?.to(`user:${request.user._id}`).emit('notification', notif)

    res.json({ success: true, newBalance: updatedUser.credits })
  } catch (err) {
    res.status(500).json({ message: 'Failed to approve request.', error: err.message })
  }
})

// ── Admin: reject a request ───────────────────────────────────────────────────
router.patch('/requests/:id/reject', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admins only.' })
  try {
    const { adminNote } = req.body
    const request = await CreditRequest.findById(req.params.id).populate('user')
    if (!request) return res.status(404).json({ message: 'Request not found.' })
    if (request.status !== 'pending') return res.status(400).json({ message: 'Request already reviewed.' })

    request.status = 'rejected'
    request.adminNote = adminNote?.trim() || ''
    request.reviewedBy = req.user._id
    request.reviewedAt = new Date()
    await request.save()

    const notif = await Notification.create({
      recipient: request.user._id,
      sender: req.user._id,
      type: 'community',
      content: `❌ Your credit top-up request for ₦${request.naira} was not confirmed.${adminNote ? ` Reason: ${adminNote}` : ' Contact admin if you believe this is a mistake.'}`,
      referenceId: request._id,
      referenceModel: 'Community',
    })
    await notif.populate('sender', 'fullName avatar')
    io?.to(`user:${request.user._id}`).emit('notification', notif)

    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to reject request.' })
  }
})

// ── Transfer credits to another user ─────────────────────────────────────────
router.post('/transfer', async (req, res) => {
  try {
    const { toUsername, amount, note } = req.body
    const amt = parseInt(amount)
    if (!toUsername || !amt || amt < 1) return res.status(400).json({ message: 'Recipient and amount required.' })

    const sender = await User.findById(req.user._id)
    if (sender.credits < amt) return res.status(400).json({ message: `Not enough credits. You have ${sender.credits}.` })

    const recipient = await User.findOne({
      $or: [
        { fullName: { $regex: new RegExp(`^${toUsername}$`, 'i') } },
        { email: toUsername.toLowerCase() },
      ],
      _id: { $ne: sender._id },
    })
    if (!recipient) return res.status(404).json({ message: 'User not found. Try their full name or email.' })

    // Debit sender
    sender.credits -= amt
    await sender.save({ validateBeforeSave: false })

    // Credit recipient
    recipient.credits += amt
    await recipient.save({ validateBeforeSave: false })

    const txNote = note?.trim() || ''

    // Record both sides
    await Promise.all([
      CreditTransaction.create({
        user: sender._id, type: 'transfer_out', amount: -amt,
        balance: sender.credits, note: `Sent to ${recipient.fullName}${txNote ? `: ${txNote}` : ''}`,
        peer: recipient._id,
      }),
      CreditTransaction.create({
        user: recipient._id, type: 'transfer_in', amount: amt,
        balance: recipient.credits, note: `Received from ${sender.fullName}${txNote ? `: ${txNote}` : ''}`,
        peer: sender._id,
      }),
    ])

    // Notify recipient
    const notif = await Notification.create({
      recipient: recipient._id,
      sender: sender._id,
      type: 'community',
      content: `💸 ${sender.fullName} sent you ${amt} credit${amt !== 1 ? 's' : ''}!${txNote ? ` "${txNote}"` : ''}`,
    })
    await notif.populate('sender', 'fullName avatar')
    io?.to(`user:${recipient._id}`).emit('notification', notif)

    res.json({ success: true, newBalance: sender.credits, recipient: recipient.fullName })
  } catch (err) {
    res.status(500).json({ message: 'Transfer failed.', error: err.message })
  }
})

// ── Admin: update bank account details ───────────────────────────────────────
router.put('/bank-info', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admins only.' })
  try {
    const { bankName, bankAccountNumber, bankAccountName } = req.body
    if (!bankName || !bankAccountNumber || !bankAccountName)
      return res.status(400).json({ message: 'All bank fields are required.' })
    await Setting.findOneAndUpdate(
      {},
      { bankName: bankName.trim(), bankAccountNumber: bankAccountNumber.trim(), bankAccountName: bankAccountName.trim() },
      { upsert: true, new: true }
    )
    res.json({ success: true })
  } catch {
    res.status(500).json({ message: 'Failed to update bank info.' })
  }
})

export default router
