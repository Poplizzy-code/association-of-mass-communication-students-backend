import mongoose from 'mongoose'

const assignmentSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    course:      { type: String, required: true },
    description: { type: String, required: true },
    dueDate:     { type: Date, required: true },
    fileUrl:     { type: String, default: '' },
    publicId:    { type: String, default: '' },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model('Assignment', assignmentSchema)
