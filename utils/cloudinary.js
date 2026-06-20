import 'dotenv/config'
import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import multer from 'multer'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000,
})

const resourceStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'amacos/resources',
    resource_type: 'auto',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
})

const newsImageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'amacos/news',
    resource_type: 'image',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
})

const makeImageStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: `amacos/${folder}`,
    resource_type: 'image',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
})

const postMediaStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'amacos/social',
    resource_type: 'auto',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
})

const mediaVideoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'amacos/media/tv',
    resource_type: 'video',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
})

const mediaAudioStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'amacos/media/radio',
    resource_type: 'video', // Cloudinary uses 'video' resource_type for audio too
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
})

const mediaImageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'amacos/media/images',
    resource_type: 'image',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
})

export const uploadResource      = multer({ storage: resourceStorage })
export const uploadNewsImage     = multer({ storage: newsImageStorage })
export const uploadEventImage    = multer({ storage: makeImageStorage('events') })
export const uploadResearchImage = multer({ storage: makeImageStorage('research') })
export const uploadAssignmentFile = multer({ storage: resourceStorage })
export const uploadPostMedia     = multer({ storage: postMediaStorage })
export const uploadMediaVideo    = multer({ storage: mediaVideoStorage, limits: { fileSize: 500 * 1024 * 1024 } })
export const uploadMediaAudio    = multer({ storage: mediaAudioStorage, limits: { fileSize: 100 * 1024 * 1024 } })
export const uploadMediaImage    = multer({ storage: mediaImageStorage })
export default cloudinary
