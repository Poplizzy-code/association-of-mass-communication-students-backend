import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    fullName:       { type: String, required: true, trim: true },
    email:          { type: String, required: true, unique: true, lowercase: true },
    password:       { type: String, required: true, minlength: 6 },
    matricNumber:   { type: String, default: '' },
    level:          { type: String, enum: ['100', '200', '300', '400', 'staff'], default: '100' },

    // Account classification
    accountType:    { type: String, enum: ['student', 'staff'], default: 'student' },

    // Staff flags (only meaningful when accountType === 'staff')
    isLecturer:     { type: Boolean, default: false },
    isStaffAdmin:   { type: Boolean, default: false },

    // Student flag
    isStudentAdmin: { type: Boolean, default: false },

    // Account status
    isActive:       { type: Boolean, default: true },

    avatar:         { type: String, default: '' },
    bio:            { type: String, default: '' },
    isTechMember:   { type: Boolean, default: false },
    lastSeen:       { type: Date, default: Date.now },
  },
  { timestamps: true }
)

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 12)
})

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

export default mongoose.model('User', userSchema)
