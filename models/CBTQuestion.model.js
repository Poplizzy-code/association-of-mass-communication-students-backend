import mongoose from 'mongoose'

const cbtSchema = new mongoose.Schema(
  {
    course:        { type: String, required: true, trim: true },
    question:      { type: String, required: true },
    optionA:       { type: String, required: true },
    optionB:       { type: String, required: true },
    optionC:       { type: String, required: true },
    optionD:       { type: String, required: true },
    correctAnswer: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    explanation:   { type: String, default: '' },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model('CBTQuestion', cbtSchema)
