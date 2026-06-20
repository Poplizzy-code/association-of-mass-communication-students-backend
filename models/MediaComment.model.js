import mongoose from 'mongoose'

const mediaCommentSchema = new mongoose.Schema({
  content:       { type: mongoose.Schema.Types.ObjectId, ref: 'MediaContent', required: true },
  author:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body:          { type: String, required: true, trim: true, maxlength: 1000 },
  likes:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaComment', default: null },
}, { timestamps: true })

mediaCommentSchema.index({ content: 1, createdAt: 1 })

export default mongoose.model('MediaComment', mediaCommentSchema)
