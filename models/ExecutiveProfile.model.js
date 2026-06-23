import mongoose from 'mongoose'

const executiveProfileSchema = new mongoose.Schema(
  {
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    position:   { type: String, required: true, trim: true },  // e.g. "President", "VP Academics"
    bio:        { type: String, default: '' },
    helpText:   { type: String, default: '' },  // "How I can help you"
    avatar:     { type: String, default: '' },  // custom photo (overrides user avatar)
    isVisible:  { type: Boolean, default: true },
    order:      { type: Number, default: 99 },  // lower = shows first
  },
  { timestamps: true }
)

export default mongoose.model('ExecutiveProfile', executiveProfileSchema)
