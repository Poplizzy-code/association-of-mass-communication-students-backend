import express from 'express'
import NewsletterSubscriber from '../models/NewsletterSubscriber.model.js'
import MediaSubscription from '../models/MediaSubscription.model.js'
import MediaContent from '../models/MediaContent.model.js'
import { protect, staffAdminOnly } from '../middleware/auth.middleware.js'
import { sendWeeklyDigest } from '../utils/newsletter.js'

const router = express.Router()

const PLATFORMS = ['tv', 'radio', 'newspaper', 'magazine']

// ── Public email newsletter ───────────────────────────────────────────────────

router.post('/subscribe', async (req, res) => {
  try {
    const { email, platforms } = req.body
    if (!email) return res.status(400).json({ message: 'Email is required.' })
    if (!platforms?.length) return res.status(400).json({ message: 'Select at least one platform.' })
    const validPlatforms = platforms.filter(p => PLATFORMS.includes(p))
    const existing = await NewsletterSubscriber.findOne({ email: email.toLowerCase() })
    if (existing) {
      existing.platforms = validPlatforms
      existing.isActive  = true
      await existing.save()
      return res.json({ success: true, message: 'Subscription updated.' })
    }
    await NewsletterSubscriber.create({ email: email.toLowerCase(), platforms: validPlatforms })
    res.status(201).json({ success: true, message: 'Subscribed successfully!' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.delete('/unsubscribe/:token', async (req, res) => {
  try {
    const sub = await NewsletterSubscriber.findOneAndUpdate(
      { token: req.params.token },
      { isActive: false },
      { new: true }
    )
    if (!sub) return res.status(404).json({ message: 'Subscription not found.' })
    res.json({ success: true, message: 'Unsubscribed successfully.' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── In-app subscriptions ──────────────────────────────────────────────────────

// Get current user's platform subscriptions
router.get('/my', protect, async (req, res) => {
  try {
    const subs = await MediaSubscription.find({ user: req.user._id })
      .populate('channel', 'name slug platform logo')
    const platforms = subs.filter(s => s.platform && !s.channel).map(s => s.platform)
    const channels  = subs.filter(s => s.channel).map(s => s.channel)
    res.json({ success: true, platforms, channels })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Subscribe / unsubscribe to a platform
router.post('/platform/:platform', protect, async (req, res) => {
  try {
    const { platform } = req.params
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ message: 'Invalid platform.' })
    const existing = await MediaSubscription.findOne({ user: req.user._id, platform, channel: null })
    if (existing) {
      await existing.deleteOne()
      return res.json({ success: true, subscribed: false })
    }
    await MediaSubscription.create({ user: req.user._id, platform })
    res.json({ success: true, subscribed: true })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// Get subscriber count for a platform
router.get('/platform/:platform/count', async (req, res) => {
  try {
    const count = await MediaSubscription.countDocuments({ platform: req.params.platform, channel: null })
    res.json({ success: true, count })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Staff: trigger weekly digest ──────────────────────────────────────────────

router.post('/digest', protect, staffAdminOnly, async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentContent = await MediaContent.find({
      status: 'published', publishedAt: { $gte: oneWeekAgo },
    }).select('_id title description platform publishedAt')

    // Group by platform
    const contentByPlatform = {}
    for (const p of PLATFORMS) contentByPlatform[p] = []
    for (const item of recentContent) contentByPlatform[item.platform]?.push(item)

    // Get email subscribers per platform
    const subscriberMap = {}
    for (const p of PLATFORMS) {
      const subs = await NewsletterSubscriber.find({ platforms: p, isActive: true }).select('email')
      subscriberMap[p] = subs.map(s => s.email)
    }

    const result = await sendWeeklyDigest(contentByPlatform, subscriberMap)
    res.json({ success: true, ...result, contentCount: recentContent.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

export default router
