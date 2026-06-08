import mongoose from 'mongoose'

// Singleton document — always use findOne() / findOneAndUpdate({}, ..., { upsert: true })
const settingSchema = new mongoose.Schema(
  {
    staffCode: { type: String, default: '' },
  },
  { timestamps: true }
)

export default mongoose.model('Setting', settingSchema)
