import mongoose from 'mongoose'

const answerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId },
  question:   { type: String },
  answer:     { type: String, default: '' },
}, { _id: false })

const communityMemberSchema = new mongoose.Schema({
  community:           { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
  user:                { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:              { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  joinMessage:         { type: String, default: '' },
  onboardingCompleted: { type: Boolean, default: false },
  onboardingAnswers:   [answerSchema],
  onboardingScore:     { type: Number, default: 0 },
  adminNote:           { type: String, default: '' },
  approvedAt:          { type: Date },
}, { timestamps: true })

communityMemberSchema.index({ community: 1, user: 1 }, { unique: true })
communityMemberSchema.index({ community: 1, status: 1 })

export default mongoose.model('CommunityMember', communityMemberSchema)
