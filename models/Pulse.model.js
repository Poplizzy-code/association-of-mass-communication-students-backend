import mongoose from 'mongoose'

const replySchema = new mongoose.Schema({
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 500 },
}, { timestamps: true })

const pulseSchema = new mongoose.Schema({
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 500 },
  image:   { type: String, default: '' },
  likes:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies: [replySchema],
}, { timestamps: true })

export default mongoose.model('Pulse', pulseSchema)
