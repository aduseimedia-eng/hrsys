// config/multer.js — file upload configuration
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

// Storage for employee profile photos
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/photos');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `photo_${req.user.id}_${Date.now()}${ext}`);
  }
});

// Storage for HR documents
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/documents');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `doc_${req.user.id}_${Date.now()}_${safe}`);
  }
});

const imageFilter = (req, file, cb) => {
  if (/image\/(jpeg|jpg|png|webp)/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const docFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file type'), false);
};

module.exports = {
  uploadPhoto: multer({ storage: photoStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } }),
  uploadDoc:   multer({ storage: docStorage,   fileFilter: docFilter,   limits: { fileSize: 20 * 1024 * 1024 } })
};
