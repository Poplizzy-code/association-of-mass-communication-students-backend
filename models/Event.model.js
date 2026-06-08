import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    date:        { type: Date, required: true },
    time:        { type: String, default: '' },
    location:    { type: String, default: '' },
    imageUrl:    { type: String, default: '' },
    publicId:    { type: String, default: '' },
    author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model('Event', eventSchema)
