import mongoose from 'mongoose'

const alumniOpportunitySchema = new mongoose.Schema(
  {
    postedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    alumniProfile:  { type: mongoose.Schema.Types.ObjectId, ref: 'AlumniProfile' },
    type:           { type: String, enum: ['job', 'internship', 'freelance', 'volunteer'], required: true },
    title:          { type: String, required: true, trim: true },
    company:        { type: String, default: '', trim: true },
    description:    { type: String, required: true },
    requirements:   [{ type: String }],
    locationType:   { type: String, enum: ['remote', 'onsite', 'hybrid'], default: 'onsite' },
    city:           { type: String, default: '' },
    deadline:       { type: Date },
    applyLink:      { type: String, default: '' },
    applyEmail:     { type: String, default: '' },
    approved:       { type: Boolean, default: false },
    status:         { type: String, enum: ['active', 'closed'], default: 'active' },
  },
  { timestamps: true }
)

alumniOpportunitySchema.index({ approved: 1, status: 1, createdAt: -1 })

export default mongoose.model('AlumniOpportunity', alumniOpportunitySchema)
