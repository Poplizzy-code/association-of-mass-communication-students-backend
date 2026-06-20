import mongoose from 'mongoose'

const positionSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 200 },
  formFee:     { type: Number, default: 0, min: 0 },
})

const electionSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 500 },
  status: {
    type: String,
    enum: ['draft', 'form_picking', 'reviewing', 'voting', 'closed', 'results_published'],
    default: 'draft',
  },
  formPickingStart:    { type: Date },
  formPickingDeadline: { type: Date },
  votingStart:         { type: Date },
  votingDeadline:      { type: Date },
  votingRequirements:  [{ type: String }],
  resultsVisibility: {
    type: String,
    enum: ['live', 'after_close', 'admin_only'],
    default: 'after_close',
  },
  positions:     [positionSchema],
  bankName:      { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  accountName:   { type: String, default: '' },
  paymentNote:   { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

export default mongoose.model('Election', electionSchema)
