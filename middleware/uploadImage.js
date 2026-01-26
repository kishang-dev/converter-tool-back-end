// pdf-parser-api/middleware/uploadImage.js
const multer = require("multer");
const path = require("path");
const fs = require("fs"); // Added for directory creation check

const uploadDirImage = path.join(__dirname, "..", "uploads"); // Relative path to uploads from middleware

// Ensure upload directory exists
if (!fs.existsSync(uploadDirImage)) {
  fs.mkdirSync(uploadDirImage, { recursive: true });
}

const storageImage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirImage);
  },
  filename: (req, file, cb) => {
    cb(null, `ocr_${Date.now()}_${file.originalname}`); // Prefix to distinguish from PDFs
  },
});

const fileFilterImage = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/tiff",
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only image files are allowed."), false);
  }
};

const uploadImage = multer({
  storage: storageImage,
  fileFilter: fileFilterImage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for images
  },
});

module.exports = uploadImage;
