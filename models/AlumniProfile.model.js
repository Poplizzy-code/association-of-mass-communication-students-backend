import mongoose from 'mongoose'

const alumniProfileSchema = new mongoose.Schema(
  {
    user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fullName:        { type: String, required: true, trim: true },
    avatar:          { type: String, default: '' },
    graduationYear:  { type: Number, required: true },
    field: {
      type: String,
      enum: ['journalism', 'broadcasting', 'pr', 'content_creation', 'advertising', 'media_production', 'filmmaking', 'other'],
      default: 'other',
    },
    currentRole:     { type: String, default: '' },
    currentCompany:  { type: String, default: '' },
    location:        { type: String, default: '' },
    bio:             { type: String, default: '' },
    achievements:    [{ type: String }],
    openToMentorship:{ type: Boolean, default: false },
    contact: {
      email:    { type: String, default: '' },
      whatsapp: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      twitter:  { type: String, default: '' },
      instagram:{ type: String, default: '' },
    },
    status:          { type: String, enum: ['pending', 'approved'], default: 'pending' },
    submittedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

alumniProfileSchema.index({ status: 1, graduationYear: -1 })
alumniProfileSchema.index({ user: 1 }, { unique: true, sparse: true })

export default mongoose.model('AlumniProfile', alumniProfileSchema)
