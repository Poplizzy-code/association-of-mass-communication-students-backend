import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { createServer } from 'http'
import { Server } from 'socket.io'
import authRoutes from './routes/auth.routes.js'
import userRoutes from './routes/user.routes.js'
import adminRoutes from './routes/admin.routes.js'
import newsRoutes from './routes/news.routes.js'
import resourcesRoutes from './routes/resources.routes.js'
import eventsRoutes from './routes/events.routes.js'
import researchRoutes from './routes/research.routes.js'
import cbtRoutes from './routes/cbt.routes.js'
import assignmentsRoutes from './routes/assignments.routes.js'
import postsRoutes from './routes/posts.routes.js'
import spotlightsRoutes from './routes/spotlights.routes.js'
import pressReleasesRoutes from './routes/pressreleases.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import messagesRoutes from './routes/messages.routes.js'
import friendRequestsRoutes from './routes/friendRequests.routes.js'
import notificationsRoutes from './routes/notifications.routes.js'
import groupRoutes from './routes/group.routes.js'
import { initSocket } from './utils/socket.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
initSocket(io)

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/news', newsRoutes)
app.use('/api/resources', resourcesRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/research', researchRoutes)
app.use('/api/cbt', cbtRoutes)
app.use('/api/assignments', assignmentsRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/spotlights', spotlightsRoutes)
app.use('/api/press', pressReleasesRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/friends', friendRequestsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/groups', groupRoutes)

io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`)
  })
  socket.on('disconnect', () => {})
})

app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: err.message || 'Server error' })
})

httpServer.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`)
})

mongoose
  .connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 5,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
    retryWrites: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })

  .catch((err) => console.error('MongoDB error:', err))
