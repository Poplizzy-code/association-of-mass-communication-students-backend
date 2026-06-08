import express from 'express'
import CBTQuestion from '../models/CBTQuestion.model.js'
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

// authenticated students get questions (answer stripped)
router.get('/', protect, async (req, res) => {
  try {
    const questions = await CBTQuestion.find()
      .select('-correctAnswer -explanation')
      .populate('createdBy', 'fullName')
      .sort({ course: 1, createdAt: 1 })
    res.json({ success: true, questions })
  } catch {
    res.status(500).json({ message: 'Failed to fetch questions.' })
  }
})

// submit answers and get score
router.post('/submit', protect, async (req, res) => {
  try {
    const { answers } = req.body // { questionId: 'A' | 'B' | 'C' | 'D' }
    const ids = Object.keys(answers)
    const questions = await CBTQuestion.find({ _id: { $in: ids } }).select('correctAnswer explanation')
    let correct = 0
    const results = questions.map(q => {
      const chosen = answers[q._id.toString()]
      const isCorrect = chosen === q.correctAnswer
      if (isCorrect) correct++
      return { id: q._id, chosen, correctAnswer: q.correctAnswer, explanation: q.explanation, isCorrect }
    })
    res.json({ success: true, score: correct, total: questions.length, results })
  } catch {
    res.status(500).json({ message: 'Failed to submit answers.' })
  }
})

export default router
