import mongoose from 'mongoose'

const questionSchema = new mongoose.Schema({
  text:          { type: String, required: true, trim: true },
  type:          { type: String, enum: ['free_text', 'mcq'], default: 'free_text' },
  options:       [{ type: String, trim: true }],
  correctAnswer: { type: String, default: '' },
  required:      { type: Boolean, default: true },
}, { _id: true })

const mediaItemSchema = new mongoose.Schema({
  kind:    { type: String, enum: ['image', 'video', 'embed'], required: true },
  url:     { type: String, required: true },
  caption: { type: String, default: '', maxlength: 200 },
  order:   { type: Number, default: 0 },
}, { _id: true })

const communitySchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 600 },
  type:        { type: String, enum: ['community', 'club'], default: 'community' },
  coverImage:  { type: String, default: '' },
  status:      { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
  plan:        { type: String, enum: ['free', 'premium', 'unlimited'], default: 'free' },

  // Info page
  infoMedia:  [mediaItemSchema],
  infoNotes:  { type: String, default: '' },

  // Founder profile
  founderProfile: {
    displayName: { type: String, default: '' },
    avatar:      { type: String, default: '' },
    about:       { type: String, default: '' },
    vision:      { type: String, default: '' },
    contact: {
      whatsapp:  { type: String, default: '' },
      email:     { type: String, default: '' },
      twitter:   { type: String, default: '' },
      instagram: { type: String, default: '' },
      other:     { type: String, default: '' },
    },
  },

  // Membership
  joinMode:      { type: String, enum: ['open', 'approval'], default: 'approval' },
  prerequisites: [{ type: String, trim: true }],

  // Group chat
  groupChatLink: { type: String, default: '' },

  // Onboarding
  onboarding: {
    enabled:       { type: Boolean, default: false },
    media:         [mediaItemSchema],
    notes:         { type: String, default: '' },
    questions:     [questionSchema],
    passingScore:  { type: Number, default: 0 },
    feedbackMode:  { type: String, enum: ['show_wrong', 'just_fail'], default: 'just_fail' },
  },

  // Upgrade request
  upgradeRequested: { type: Boolean, default: false },

  // Team
  founder:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  adminNote: { type: String, default: '' },
}, { timestamps: true })

communitySchema.index({ status: 1, type: 1 })

export default mongoose.model('Community', communitySchema)
