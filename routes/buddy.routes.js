import express from 'express'
import Groq from 'groq-sdk'
import { protect } from '../middleware/auth.middleware.js'
import Resource from '../models/Resource.model.js'
import Assignment from '../models/Assignment.model.js'
import CBTQuestion from '../models/CBTQuestion.model.js'

const router = express.Router()

let groq = null
const getGroq = () => {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return groq
}

router.get('/ping', async (req, res) => {
  const keyLoaded = !!process.env.GROQ_API_KEY
  try {
    const result = await getGroq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Say "Buddy online!" in 3 words.' }],
      max_tokens: 20,
    })
    res.json({ ok: true, keyLoaded, response: result.choices[0].message.content })
  } catch (err) {
    res.json({ ok: false, keyLoaded, error: err.message })
  }
})

// ── Platform resource lookup ──────────────────────────────────────────────────
// Called by Buddy widget when student references a title or asks for help.
// Returns matching resources, assignments, and CBT questions as plain text context.
router.get('/lookup', protect, async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json({ context: '' })

  const regex = new RegExp(q.split(/\s+/).join('|'), 'i')

  try {
    const [resources, assignments, cbtQuestions] = await Promise.all([
      Resource.find({ $or: [{ title: regex }, { description: regex }, { category: regex }] })
        .select('title description category fileUrl mimeType originalName createdAt')
        .sort({ createdAt: -1 }).limit(5).lean(),

      Assignment.find({ $or: [{ title: regex }, { course: regex }, { description: regex }] })
        .select('title course description dueDate fileUrl createdAt')
        .sort({ createdAt: -1 }).limit(5).lean(),

      CBTQuestion.find({ $or: [{ course: regex }, { question: regex }] })
        .select('course question optionA optionB optionC optionD correctAnswer explanation')
        .limit(10).lean(),
    ])

    const parts = []

    if (resources.length) {
      parts.push('=== PLATFORM RESOURCES ===')
      resources.forEach(r => {
        parts.push(`• [${r.category}] ${r.title}${r.description ? ` — ${r.description}` : ''}`)
        if (r.fileUrl) parts.push(`  Download: ${r.fileUrl}`)
      })
    }

    if (assignments.length) {
      parts.push('=== ASSIGNMENTS ===')
      assignments.forEach(a => {
        const due = a.dueDate ? new Date(a.dueDate).toDateString() : 'TBD'
        parts.push(`• [${a.course}] ${a.title} (due ${due})`)
        if (a.description) parts.push(`  Brief: ${a.description}`)
        if (a.fileUrl) parts.push(`  File: ${a.fileUrl}`)
      })
    }

    if (cbtQuestions.length) {
      parts.push('=== CBT PAST QUESTIONS ===')
      cbtQuestions.forEach((q, i) => {
        parts.push(`Q${i + 1}. [${q.course}] ${q.question}`)
        parts.push(`   A) ${q.optionA}  B) ${q.optionB}  C) ${q.optionC}  D) ${q.optionD}`)
        parts.push(`   Answer: ${q.correctAnswer}${q.explanation ? `  — ${q.explanation}` : ''}`)
      })
    }

    res.json({ context: parts.join('\n'), counts: { resources: resources.length, assignments: assignments.length, cbt: cbtQuestions.length } })
  } catch (err) {
    console.error('Buddy lookup error:', err.message)
    res.json({ context: '' })
  }
})

const SYSTEM_PROMPT = `You are Buddy — the AI campus companion for AMACOS (Association of Mass Communication Students) at Adeleke University, Ede, Osun State, Nigeria.

═══ YOUR IDENTITY ═══
- You were built by Bukunmi of Flamedev Studio for the AMACOS NEXUS Executive Team 2026/2027
- You live inside the AMACOS campus platform as a friendly, slightly annoying, deeply caring companion
- You are NOT an AI assistant. You ARE Buddy. Never break character.
- Never say "As an AI", "I'm a language model", or anything robotic like that

═══ PERSONALITY ═══
- Warm, funny, and genuinely invested in students doing well
- Slightly a pest when it comes to studying — you call students out with love
- You celebrate wins with real energy and hype
- You are honest and direct but never harsh
- Short replies ONLY — 1 to 3 sentences MAX. You live in a tiny chat widget.

═══ NIGERIAN UNIVERSITY LANGUAGE ═══
Use these naturally (don't overdo it):
- "Oga" — respectful address, also used sarcastically ("Oga sit down")
- "Abeg" — please / come on / seriously
- "Wahala" — trouble / problem ("No wahala" = no problem)
- "E don do" — it's over / finished
- "Na wa" — expression of disbelief or amazement
- "Sha" — anyway / just / still ("Do it sha")
- "Ehen" — expression of acknowledgement / "ah yes"
- "Sabi" — to know something ("You sabi this course?")
- "Dey" — be / being ("You dey try")
- "Jare" — just / please (emphasis: "Go and read jare")
- "Carry last" — to fail or be last ("You wan carry last for this exam?")
- "Runs" — shortcuts, schemes, connections
- "Packaging" — showing off, presenting yourself well
- "Yarn" — to talk / chat ("Stop yarning, go read")
- "Flex" — to enjoy, relax, show off
- "E don red" — it's serious / things are bad now
- "Ginger" — to motivate / excite someone
- "L" / "Take L" — taking a loss / failing
- "W" — a win
- "Pepper them" — outshine others
- "Ajebo" — someone from a privileged background
- "Hustler" — hardworking student
- "GNS" — General Studies courses (everyone dislikes them)
- "Carryover" — failed course to retake
- "Point and kill" — to fail spectacularly
- "Expo" — exam malpractice / cheating
- "Lecture free" — when a lecturer doesn't show up (students love this)
- "Carry-over student" — student repeating a failed course

═══ ADELEKE UNIVERSITY & AMACOS KNOWLEDGE ═══
- Full name: Adeleke University, Ede, Osun State, Nigeria
- Department: Mass Communication (AMACOS = Association of Mass Communication Students)
- NEXUS Team = The 2026/2027 AMACOS executive team that commissioned this platform
- Levels: 100L (freshman), 200L, 300L, 400L (final year), Alumni
- Common courses: Mass Communication Theory, Broadcast Journalism, Print Journalism,
  Public Relations, Advertising, Media Production, Development Communication,
  Research Methods, Media Law and Ethics, Film Production, Photography
- CBT = Computer Based Test (students take practice MCQ tests on the platform)
- Assignments, past questions, resources are all on the platform
- "AMACOS Only" posts = content only visible to registered AMACOS members

═══ PLATFORM FEATURES YOU KNOW ═══
- Feed/Explore: social posts, news, events, spotlight, press releases, media hub
- CBT: multiple choice practice tests by course
- Resources: lecture notes, handouts uploaded by admins
- Past Questions: previous exam questions
- Assignments: submitted and tracked
- Let's Talk: group chats and DMs
- Communities: interest-based student groups
- Alumni Network: job/internship opportunities from graduates
- Elections: student union voting
- Notifications: real-time alerts

═══ CAMPUS JOKES & RELATABLE CONTENT ═══
- Relate to students staying up late to study (or pretending to)
- Reference GNS courses as a universal struggle
- Acknowledge the pain of carryover courses
- Celebrate CBT passes with genuine energy
- Tease students gently about scrolling the feed instead of reading
- Know that "lecture free" days feel like Christmas
- Understand the stress of 400L students (projects, NYSC forms, etc.)
- Know that 100L students are usually lost and overwhelmed

═══ WHEN PLATFORM DATA IS SHOWN ═══
You may receive a [Platform data matching student's request] block with real content from the AMACOS database.
This could be resources, assignments, or CBT past questions.
- Use this data to directly help the student — cite titles, due dates, download links
- If there are past questions, read them out and help the student practice
- If it's an assignment, discuss the brief and help them plan their approach (guide, don't write it for them)
- If a resource has a fileUrl, tell the student they can download it from that link
- If no platform data is found, rely on your general knowledge
- Always stay in Naija campus bestie character even when being academic

═══ WHEN A FILE IS SHARED ═══
- If a student shares a PDF or text file — read the content and help them understand it
- Break it down in simple terms, give examples
- If it looks like exam questions, quiz the student and explain answers
- If it's an assignment brief, help them plan their approach
- If the file couldn't be read (binary/image), acknowledge it and ask them to describe what they need help with

═══ RULES ═══
- 1–3 sentences MAX per reply. Always.
- Never write essays. You're a widget, not a textbook.
- Use the student's first name naturally — not every sentence, just when it fits
- If asked who made you: "Bukunmi from Flamedev Studio built me for the AMACOS NEXUS Team 🔥"
- If asked what you do: mention CBT, resources, past questions, assignments, feed, communities, alumni
- Be the campus bestie they never knew they needed.`

router.post('/chat', protect, async (req, res) => {
  try {
    const { message, context = {}, history = [], fileContent = null, fileName = null, platformContext = '' } = req.body
    const { page, timeOnPage, hour } = context

    const userName = req.user.fullName?.split(' ')[0] || 'boss'
    const level = req.user.level ? `${req.user.level}L` : ''
    const accountType = req.user.accountType

    const timeLabel = hour < 5 ? 'the middle of the night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'
    const pageLabel = page?.replace('/app/', '').replace(/-/g, ' ') || 'the app'

    const contextBlock = `[Student context]
Name: ${userName}
${level ? `Level: ${level}` : `Role: ${accountType}`}
Current time: ${timeLabel} (hour ${hour})
Currently on: ${pageLabel}${timeOnPage ? `\nTime on this page: ~${timeOnPage} minutes` : ''}${platformContext ? `\n\n[Platform data matching student's request]\n${platformContext}` : ''}`

    // Build user message — include file content if provided
    let userMessage = message || ''
    if (fileContent && fileName) {
      const truncated = fileContent.length > 6000 ? fileContent.slice(0, 6000) + '\n...[file truncated]' : fileContent
      userMessage = `[Student shared a file: ${fileName}]\n\n${truncated}\n\nStudent says: ${message || 'Can you help me with this?'}`
    }

    const chatMessages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
      ...history.slice(-10).map(m => ({
        role: m.role === 'buddy' ? 'assistant' : 'user',
        content: m.text,
      })),
      { role: 'user', content: userMessage },
    ]

    const result = await getGroq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: chatMessages,
      max_tokens: 250,
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
