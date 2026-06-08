import mongoose from 'mongoose'

const spotlightSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true, trim: true },
    projectTitle: { type: String, required: true, trim: true },
    level: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '' },
    publicId: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model('Spotlight', spotlightSchema)
