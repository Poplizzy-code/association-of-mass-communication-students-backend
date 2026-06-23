import mongoose from 'mongoose'

const creditTxSchema = new mongoose.Schema(
  {
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type:      { type: String, enum: ['topup', 'transfer_in', 'transfer_out', 'spend', 'starter'], required: true },
    amount:    { type: Number, required: true },       // positive = earned, negative = spent
    balance:   { type: Number, required: true },       // balance after this tx
    note:      { type: String, default: '' },          // "Boosted post", "Gift from Tunde", etc.
    ref:       { type: mongoose.Schema.Types.ObjectId }, // CreditRequest._id or other entity
    refModel:  { type: String },
    peer:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // for transfers
  },
  { timestamps: true }
)

creditTxSchema.index({ user: 1, createdAt: -1 })

export default mongoose.model('CreditTransaction', creditTxSchema)
