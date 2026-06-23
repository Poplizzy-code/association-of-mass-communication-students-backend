import mongoose from 'mongoose'

// Singleton document — always use findOne() / findOneAndUpdate({}, ..., { upsert: true })
const settingSchema = new mongoose.Schema(
  {
    staffCode:      { type: String, default: '' },
    currentSession: { type: String, default: '' },
    bankName:       { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankAccountName:   { type: String, default: '' },
    creditPackages: {
      type: [{
        naira:   { type: Number },
        credits: { type: Number },
        label:   { type: String },
      }],
      default: [
        { naira: 200,  credits: 50,  label: 'Starter' },
        { naira: 500,  credits: 150, label: 'Popular' },
        { naira: 1000, credits: 350, label: 'Value'   },
        { naira: 2000, credits: 800, label: 'Pro'     },
      ],
    },
  },
  { timestamps: true }
)

export default mongoose.model('Setting', settingSchema)
