import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema(
  {
    sender:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content:     { type: String, trim: true, default: '' },
    messageType: { type: String, enum: ['text', 'emoji', 'sticker', 'media'], default: 'text' },
    mediaUrl:    { type: String, default: '' },
    mediaType:   { type: String, default: '' },  // 'image' | 'video' | 'file'
    mediaName:   { type: String, default: '' },
    stickerId:   { type: String, default: '' },
    read:        { type: Boolean, default: false },
  },
  { timestamps: true }
)

export default mongoose.model('Message', messageSchema)
