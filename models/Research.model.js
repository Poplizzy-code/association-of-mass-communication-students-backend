import mongoose from 'mongoose'

const researchSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    link:        { type: String, default: '' },
    deadline:    { type: Date },
    category:    { type: String, enum: ['research', 'opportunity', 'scholarship', 'internship', 'other'], default: 'other' },
    imageUrl:    { type: String, default: '' },
    publicId:    { type: String, default: '' },
    author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model('Research', researchSchema)
