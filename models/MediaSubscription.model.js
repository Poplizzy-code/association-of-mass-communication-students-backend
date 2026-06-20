import mongoose from 'mongoose'

// One doc per (user, platform) pair OR per (user, channel) pair
const mediaSubscriptionSchema = new mongoose.Schema({
  user:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Exactly one of the two below is set:
  platform:          { type: String, enum: ['tv', 'radio', 'newspaper', 'magazine'], default: null },
  channel:           { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  emailNotification: { type: Boolean, default: true },
  pushNotification:  { type: Boolean, default: true },
}, { timestamps: true })

mediaSubscriptionSchema.index({ user: 1, platform: 1 }, { unique: true, sparse: true })
mediaSubscriptionSchema.index({ user: 1, channel: 1 }, { unique: true, sparse: true })
mediaSubscriptionSchema.index({ channel: 1 })
mediaSubscriptionSchema.index({ platform: 1 })

export default mongoose.model('MediaSubscription', mediaSubscriptionSchema)
