import mongoose from 'mongoose'

const groupMessageSchema = new mongoose.Schema({
  group:       { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  sender:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:     { type: String, trim: true, default: '' },
  messageType: { type: String, enum: ['text', 'emoji', 'sticker', 'media'], default: 'text' },
  mediaUrl:    { type: String, default: '' },
  mediaType:   { type: String, default: '' },
  mediaName:   { type: String, default: '' },
  stickerId:   { type: String, default: '' },
}, { timestamps: true })

groupMessageSchema.index({ group: 1, createdAt: 1 })

export default mongoose.model('GroupMessage', groupMessageSchema)
