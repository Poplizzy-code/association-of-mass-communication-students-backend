import express from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import Election from '../models/Election.model.js'
import Aspirant from '../models/Aspirant.model.js'
import Vote from '../models/Vote.model.js'
import Notification from '../models/Notification.model.js'
import User from '../models/User.model.js'
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
    const r = new Readable(); r.push(buffer); r.push(null); r.pipe(stream)
  })

const isAdmin = (user) => user.isStaffAdmin || user.isStudentAdmin || user.accountType === 'staff'

const STATUS_ORDER = ['draft', 'form_picking', 'reviewing', 'voting', 'closed', 'results_published']

// ── List elections ─────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const filter = isAdmin(req.user) ? {} : { status: { $ne: 'draft' } }
    const elections = await Election.find(filter)
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
    res.json({ success: true, elections })
  } catch { res.status(500).json({ message: 'Failed to load elections.' }) }
})

// ── Create election ────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admin only.' })
  try {
    const election = await Election.create({ ...req.body, createdBy: req.user._id })
    await election.populate('createdBy', 'fullName')
    res.status(201).json({ success: true, election })
  } catch (err) { res.status(500).json({ message: err.message || 'Failed to create election.' }) }
})

// ── Get election detail ────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id).populate('createdBy', 'fullName')
    if (!election) return res.status(404).json({ message: 'Election not found.' })
    if (election.status === 'draft' && !isAdmin(req.user))
      return res.status(403).json({ message: 'Not available yet.' })

    const aspirants = await Aspirant.find({ election: req.params.id, status: 'approved' })
      .populate('applicant', 'fullName avatar level accountType')

    const myVotes      = await Vote.find({ election: req.params.id, voter: req.user._id })
    const myApplication = await Aspirant.findOne({ election: req.params.id, applicant: req.user._id })

    res.json({
      success: true,
      election,
      aspirants,
      hasVoted: myVotes.length > 0,
      myVotedPositions: myVotes.map(v => v.position),
      myApplication,
    })
  } catch { res.status(500).json({ message: 'Failed to load election.' }) }
})

// ── Update election ────────────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admin only.' })
  try {
    const election = await Election.findById(req.params.id)
    if (!election) return res.status(404).json({ message: 'Not found.' })
    Object.assign(election, req.body)
    await election.save()
    res.json({ success: true, election })
  } catch { res.status(500).json({ message: 'Failed to update.' }) }
})

// ── Advance status ─────────────────────────────────────────────────────────
router.put('/:id/advance', protect, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admin only.' })
  try {
    const election = await Election.findById(req.params.id)
    if (!election) return res.status(404).json({ message: 'Not found.' })
    const idx = STATUS_ORDER.indexOf(election.status)
    if (idx >= STATUS_ORDER.length - 1)
      return res.status(400).json({ message: 'Already at final stage.' })
    election.status = STATUS_ORDER[idx + 1]
    await election.save()
    if (election.status === 'results_published') {
      getIO()?.emit('election_results_published', { electionId: election._id.toString() })
    }
    res.json({ success: true, election })
  } catch { res.status(500).json({ message: 'Failed to advance.' }) }
})

// ── Delete election ────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admin only.' })
  try {
    const election = await Election.findById(req.params.id)
    if (!election) return res.status(404).json({ message: 'Not found.' })
    await Aspirant.deleteMany({ election: req.params.id })
    await Vote.deleteMany({ election: req.params.id })
    await election.deleteOne()
    res.json({ success: true })
  } catch { res.status(500).json({ message: 'Failed to delete.' }) }
})

// ── Submit aspirant form ───────────────────────────────────────────────────
router.post('/:id/aspirants', protect, upload.single('paymentEvidence'), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id)
    if (!election) return res.status(404).json({ message: 'Not found.' })
    if (election.status !== 'form_picking')
      return res.status(400).json({ message: 'Form picking is not currently open.' })

    const { position, statement } = req.body
    if (!position) return res.status(400).json({ message: 'Position is required.' })

    const pos = election.positions.find(p => p.title === position)
    if (!pos) return res.status(400).json({ message: 'Invalid position.' })

    let paymentEvidence = ''
    if (pos.formFee > 0) {
      if (!req.file) return res.status(400).json({ message: 'Payment evidence is required for this position.' })
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'amacos/elections/payment',
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      })
      paymentEvidence = result.secure_url
    }

    const aspirant = await Aspirant.create({
      election: req.params.id,
      applicant: req.user._id,
      position,
      statement: statement?.trim() || '',
      paymentEvidence,
    })
    await aspirant.populate('applicant', 'fullName avatar level accountType')

    // Notify admins
    const io = getIO()
    const admins = await User.find({ $or: [{ isStaffAdmin: true }, { isStudentAdmin: true }] })
    for (const admin of admins) {
      const notif = await Notification.create({
        recipient: admin._id,
        sender: req.user._id,
        type: 'election',
        content: `${req.user.fullName} submitted a form to contest for ${position} in "${election.title}"`,
        referenceId: election._id,
        referenceModel: 'Election',
      })
      await notif.populate('sender', 'fullName avatar')
      io?.to(`user:${admin._id}`).emit('notification', notif)
    }

    res.status(201).json({ success: true, aspirant })
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'You have already applied for this position.' })
    res.status(500).json({ message: err.message || 'Failed to submit.' })
  }
})

// ── Get all aspirants (admin) ──────────────────────────────────────────────
router.get('/:id/aspirants', protect, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admin only.' })
  try {
    const aspirants = await Aspirant.find({ election: req.params.id })
      .populate('applicant', 'fullName avatar level accountType')
      .sort({ position: 1, createdAt: 1 })
    res.json({ success: true, aspirants })
  } catch { res.status(500).json({ message: 'Failed to load aspirants.' }) }
})

// ── Approve / reject aspirant ──────────────────────────────────────────────
router.put('/:id/aspirants/:aid', protect, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admin only.' })
  try {
    const { status, adminNote } = req.body
    if (!['approved', 'rejected'].includes(status))
      return res.status(400).json({ message: 'Invalid status.' })

    const aspirant = await Aspirant.findById(req.params.aid)
      .populate('applicant', 'fullName avatar')
    if (!aspirant) return res.status(404).json({ message: 'Not found.' })

    const election = await Election.findById(req.params.id)
    aspirant.status   = status
    aspirant.adminNote = adminNote?.trim() || ''
    await aspirant.save()

    const content = status === 'approved'
      ? `Your aspirant form for ${aspirant.position} in "${election.title}" has been approved! 🎉`
      : `Your aspirant form for ${aspirant.position} in "${election.title}" was not approved.${adminNote ? ` Note: ${adminNote}` : ''}`

    const notif = await Notification.create({
      recipient: aspirant.applicant._id,
      sender: req.user._id,
      type: 'election',
      content,
      referenceId: election._id,
      referenceModel: 'Election',
    })
    await notif.populate('sender', 'fullName avatar')
    getIO()?.to(`user:${aspirant.applicant._id}`).emit('notification', notif)

    res.json({ success: true, aspirant })
  } catch { res.status(500).json({ message: 'Failed to update aspirant.' }) }
})

// ── Cast votes ─────────────────────────────────────────────────────────────
router.post('/:id/vote', protect, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id)
    if (!election) return res.status(404).json({ message: 'Not found.' })
    if (election.status !== 'voting')
      return res.status(400).json({ message: 'Voting is not currently open.' })

    const { votes } = req.body // [{ position, contestant }]
    if (!Array.isArray(votes) || !votes.length)
      return res.status(400).json({ message: 'No votes provided.' })

    const existingVotes    = await Vote.find({ election: req.params.id, voter: req.user._id })
    const alreadyVoted     = existingVotes.map(v => v.position)
    const newVotes         = votes.filter(v => !alreadyVoted.includes(v.position))
    if (!newVotes.length)
      return res.status(400).json({ message: 'You have already voted for all submitted positions.' })

    await Vote.insertMany(
      newVotes.map(v => ({ election: req.params.id, voter: req.user._id, position: v.position, contestant: v.contestant })),
      { ordered: false }
    )

    // Emit live tally update if resultsVisibility is live
    if (election.resultsVisibility === 'live') {
      const io = getIO()
      if (io) {
        for (const v of newVotes) {
          const tally = await Vote.aggregate([
            { $match: { election: election._id, position: v.position } },
            { $group: { _id: '$contestant', count: { $sum: 1 } } },
          ])
          io.emit('vote_update', { electionId: req.params.id, position: v.position, tally })
        }
      }
    }

    res.json({ success: true, message: 'Votes cast successfully.' })
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Duplicate vote detected.' })
    res.status(500).json({ message: err.message || 'Failed to cast votes.' })
  }
})

// ── Get results ────────────────────────────────────────────────────────────
router.get('/:id/results', protect, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id)
    if (!election) return res.status(404).json({ message: 'Not found.' })

    const admin = isAdmin(req.user)
    if (!admin) {
      if (election.resultsVisibility === 'admin_only')
        return res.status(403).json({ message: 'Results not yet public.' })
      if (election.resultsVisibility === 'after_close' &&
          !['closed', 'results_published'].includes(election.status))
        return res.status(403).json({ message: 'Results available after voting closes.' })
    }

    // Aggregate votes — no voter identity exposed, only counts per contestant per position
    const tally = await Vote.aggregate([
      { $match: { election: election._id } },
      { $group: { _id: { position: '$position', contestant: '$contestant' }, count: { $sum: 1 } } },
    ])

    const totalVoters = (await Vote.distinct('voter', { election: election._id })).length

    const contestantIds = [...new Set(tally.map(t => t._id.contestant.toString()))]
    const aspirants = await Aspirant.find({
      election: req.params.id,
      status: 'approved',
      applicant: { $in: contestantIds },
    }).populate('applicant', 'fullName avatar level accountType')

    const results = {}
    for (const pos of election.positions) {
      const posVotes = tally.filter(t => t._id.position === pos.title)
      results[pos.title] = posVotes.map(pv => {
        const a = aspirants.find(x => x.applicant._id.toString() === pv._id.contestant.toString())
        return { contestant: a?.applicant || null, statement: a?.statement || '', votes: pv.count }
      }).sort((a, b) => b.votes - a.votes)

      // Add contestants with 0 votes (approved but no votes yet)
      const withVotes = new Set(posVotes.map(pv => pv._id.contestant.toString()))
      const zeroVote  = aspirants.filter(a => a.position === pos.title && !withVotes.has(a.applicant._id.toString()))
      results[pos.title].push(...zeroVote.map(a => ({ contestant: a.applicant, statement: a.statement, votes: 0 })))
    }

    res.json({ success: true, results, totalVoters })
  } catch { res.status(500).json({ message: 'Failed to load results.' }) }
})

export default router
