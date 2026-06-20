import mongoose from 'mongoose'
import crypto from 'crypto'

const newsletterSubscriberSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  platforms: [{ type: String, enum: ['tv', 'radio', 'newspaper', 'magazine'] }],
  token:     { type: String, default: () => crypto.randomBytes(32).toString('hex') },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema)
