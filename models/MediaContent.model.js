import mongoose from 'mongoose'

const PLATFORMS = ['tv', 'radio', 'newspaper', 'magazine']
const STATUSES  = ['draft', 'pending', 'published', 'rejected', 'archived']

const mediaContentSchema = new mongoose.Schema({
  platform:         { type: String, enum: PLATFORMS, required: true },
  title:            { type: String, required: true, trim: true },
  description:      { type: String, default: '' },
  body:             { type: String, default: '' }, // article body for newspaper/magazine
  mediaUrl:         { type: String, default: '' }, // Cloudinary URL (video/audio)
  publicId:         { type: String, default: '' },
  mimeType:         { type: String, default: '' },
  thumbnail:        { type: String, default: '' },
  thumbnailPublicId:{ type: String, default: '' },
  duration:         { type: Number, default: 0 },  // seconds
  category:         { type: String, default: '' },
  tags:             [String],
  author:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel:          { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },

  // Editorial workflow
  status:           { type: String, enum: STATUSES, default: 'draft' },
  rejectionReason:  { type: String, default: '' },
  reviewedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt:       { type: Date, default: null },
  publishedAt:      { type: Date, default: null },

  // Live broadcast
  isLive:           { type: Boolean, default: false },
  liveUrl:          { type: String, default: '' },
  liveScheduledAt:  { type: Date, default: null },

  views:            { type: Number, default: 0 },
  likes:            [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentsCount:    { type: Number, default: 0 },
}, { timestamps: true })

mediaContentSchema.index({ platform: 1, status: 1, publishedAt: -1 })
mediaContentSchema.index({ channel: 1, status: 1, publishedAt: -1 })
mediaContentSchema.index({ author: 1, createdAt: -1 })
mediaContentSchema.index({ status: 1, createdAt: -1 })

export default mongoose.model('MediaContent', mediaContentSchema)
