import mongoose from 'mongoose'

const voteSchema = new mongoose.Schema({
  election:   { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  voter:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  position:   { type: String, required: true },
  contestant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

// One vote per voter per position per election — enforced at DB level
voteSchema.index({ election: 1, voter: 1, position: 1 }, { unique: true })

export default mongoose.model('Vote', voteSchema)
