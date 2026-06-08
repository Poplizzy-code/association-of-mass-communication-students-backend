import mongoose from 'mongoose'

const commentSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true, trim: true },
}, { timestamps: true })

const postSchema = new mongoose.Schema(
  {
    author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content:   { type: String, default: '' },
    mediaUrl:  { type: String, default: '' },
    mediaType: { type: String, enum: ['image', 'video', ''], default: '' },
    publicId:  { type: String, default: '' },
    isPublic:  { type: Boolean, default: true },
    likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments:  [commentSchema],
  },
  { timestamps: true }
)

export default mongoose.model('Post', postSchema)
