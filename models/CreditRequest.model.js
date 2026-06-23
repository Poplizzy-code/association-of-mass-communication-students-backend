import mongoose from 'mongoose'

const creditRequestSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    naira:       { type: Number, required: true },     // amount they claim to have paid
    credits:     { type: Number, required: true },     // credits they expect to receive
    note:        { type: String, default: '' },        // optional student note ("paid via GTB")
    status:      { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminNote:   { type: String, default: '' },
    reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:  { type: Date },
  },
  { timestamps: true }
)

export default mongoose.model('CreditRequest', creditRequestSchema)
