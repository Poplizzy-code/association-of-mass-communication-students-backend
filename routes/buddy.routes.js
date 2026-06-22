import express from 'express'
import Groq from 'groq-sdk'
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Quick diagnostic — visit /api/buddy/ping in browser
router.get('/ping', async (req, res) => {
  const keyLoaded = !!process.env.GROQ_API_KEY
  try {
    const result = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: 'Say "Buddy online!" in 3 words.' }],
      max_tokens: 20,
    })
    res.json({ ok: true, keyLoaded, response: result.choices[0].message.content })
  } catch (err) {
    res.json({ ok: false, keyLoaded, error: err.message })
  }
})

const SYSTEM_PROMPT = `You are Buddy — the AI campus companion for AMACOS (Association of Mass Communication Students) at Adeleke University, Nigeria.

Your personality:
- Warm, funny, and genuinely invested in students doing well
- Speak casually with natural Nigerian flavour — drop words like "oga", "abeg", "sha", "na wa", "e don do", "wahala" where they fit naturally. Don't overdo it.
- You are slightly a pest about academics — you'll call students out lovingly when they're slacking
- You celebrate wins with real energy
- You give short, punchy replies — 1 to 3 sentences MAX. You live in a tiny chat widget, not a blog.
- Never say "As an AI" or "I'm a language model". You ARE Buddy. Full stop.
- If asked who made you: "Bukunmi from Flamedev Studio built me for the AMACOS NEXUS Team 2026/2027 🔥"
- If asked what you can help with: mention CBT practice, resources, past questions, assignments, the community feed, alumni network, communities, elections, and group chats
- You know the student's name and level — use them naturally, not robotically
- You genuinely care. You're not just a bot, you're their campus bestie who happens to live in their phone.`

router.post('/chat', protect, async (req, res) => {
  try {
    const { message, context = {}, history = [] } = req.body
    const { page, timeOnPage, hour } = context

    const userName = req.user.fullName?.split(' ')[0] || 'boss'
    const level = req.user.level ? `${req.user.level}L` : ''
    const accountType = req.user.accountType

    const timeLabel = hour < 5 ? 'the middle of the night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'
    const pageLabel = page?.replace('/app/', '').replace('-', ' ') || 'the app'

    const contextBlock = `
[Student context]
Name: ${userName}
${level ? `Level: ${level}` : `Role: ${accountType}`}
Current time: ${timeLabel} (hour ${hour})
Currently on: ${pageLabel}
${timeOnPage ? `Time on this page: ~${timeOnPage} minutes` : ''}
`.trim()

    const chatMessages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
      ...history.slice(-10).map(m => ({
        role: m.role === 'buddy' ? 'assistant' : 'user',
        content: m.text,
      })),
      { role: 'user', content: message },
    ]

    const result = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: chatMessages,
      max_tokens: 200,
      temperature: 0.85,
    })

    const reply = result.choices[0].message.content

    res.json({ reply })
  } catch (err) {
    console.error('Buddy error:', err.message)
    res.status(500).json({ reply: "Abeg my signal cut 😅 try again?", _debug: err.message })
  }
})

export default router
