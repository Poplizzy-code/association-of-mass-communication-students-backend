import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    recipient:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sender:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type:           {
      type: String,
      enum: ['message', 'friend_request', 'friend_accepted', 'post_like', 'post_comment'],
      required: true,
    },
    content:        { type: String },
    referenceId:    { type: mongoose.Schema.Types.ObjectId },
    referenceModel: { type: String, enum: ['Post', 'Message', 'FriendRequest'] },
    read:           { type: Boolean, default: false },
  },
  { timestamps: true }
)

notificationSchema.index({ recipient: 1, createdAt: -1 })

export default mongoose.model('Notification', notificationSchema)
