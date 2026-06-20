import mongoose from 'mongoose'

const aspirantSchema = new mongoose.Schema({
  election:        { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  applicant:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  position:        { type: String, required: true, trim: true },
  statement:       { type: String, default: '', maxlength: 300 },
  paymentEvidence: { type: String, default: '' },
  status:          { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote:       { type: String, default: '' },
}, { timestamps: true })

// One application per user per position per election
aspirantSchema.index({ election: 1, applicant: 1, position: 1 }, { unique: true })

export default mongoose.model('Aspirant', aspirantSchema)
