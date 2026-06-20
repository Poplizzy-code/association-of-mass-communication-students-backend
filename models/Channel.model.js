import mongoose from 'mongoose'

const channelSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  slug:           { type: String, unique: true, lowercase: true, trim: true },
  description:    { type: String, default: '' },
  platform:       { type: String, enum: ['tv', 'radio'], required: true },
  logo:           { type: String, default: '' },
  logoPublicId:   { type: String, default: '' },
  coverImage:     { type: String, default: '' },
  coverPublicId:  { type: String, default: '' },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['host', 'co-host', 'member'], default: 'member' },
  }],
  followersCount: { type: Number, default: 0 },
  isLive:         { type: Boolean, default: false },
  liveUrl:        { type: String, default: '' },
  liveTitle:      { type: String, default: '' },
  isVerified:     { type: Boolean, default: false },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true })

channelSchema.index({ platform: 1, createdAt: -1 })
channelSchema.index({ slug: 1 })

export default mongoose.model('Channel', channelSchema)
