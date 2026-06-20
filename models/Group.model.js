import mongoose from 'mongoose'

const groupSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, default: '', maxlength: 200 },
  avatar:      { type: String, default: '' },
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isPublic:    { type: Boolean, default: false },
  inviteCode:  { type: String, default: '', index: { sparse: true } },
}, { timestamps: true })

export default mongoose.model('Group', groupSchema)
