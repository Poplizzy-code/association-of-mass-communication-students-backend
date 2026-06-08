import express from 'express'
import News from '../models/News.model.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 0
    let q = News.find().populate('author', 'fullName').sort({ createdAt: -1 })
    if (limit > 0) q = q.limit(limit)
    const news = await q.exec()
    res.json({ success: true, news })
  } catch {
    res.status(500).json({ message: 'Failed to fetch news.' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id).populate('author', 'fullName')
    if (!newsItem) return res.status(404).json({ message: 'News not found.' })
    res.json({ success: true, news: newsItem })
  } catch {
    res.status(500).json({ message: 'Failed to fetch news item.' })
  }
})

export default router
