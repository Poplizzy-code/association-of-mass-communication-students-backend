import mongoose from 'mongoose'

const replySchema = new mongoose.Schema({
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  likes:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true })

const forumThreadSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true, maxlength: 200 },
  content:  { type: String, required: true, trim: true, maxlength: 5000 },
  author:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, enum: ['general', 'academic', 'help', 'events', 'fun', 'tech'], default: 'general' },
  pinned:   { type: Boolean, default: false },
  views:    { type: Number, default: 0 },
  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies:  [replySchema],
}, { timestamps: true })

forumThreadSchema.index({ category: 1, createdAt: -1 })
forumThreadSchema.index({ pinned: -1, createdAt: -1 })

export default mongoose.model('ForumThread', forumThreadSchema)
