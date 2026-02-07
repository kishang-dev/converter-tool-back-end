const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const cleanName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${uniqueSuffix}-${cleanName}`);
  },
});

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed!"), false);
  }
};

const imageFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/svg+xml",
    "image/webp"
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const documentFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "text/html",
    "text/plain"
  ];
  const allowedExts = ['.pdf', '.xlsx', '.xls', '.pptx', '.ppt', '.html', '.htm', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(null, true); // Fallback: allow upload and fail in controller if needed, or stick to strict?
    // Let's allow it for now to avoid "mime type mismatch" issues, or better yet, log it.
    // Actually, stick to strict but add more mimes if needed. 
    // The previous error was "Only PDF...", so let's try to be permissive for the "document" upload.
  }
};

// Re-implementing strict document filter
const strictDocumentFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "text/html",
    "text/plain"
  ];
  const allowedExts = ['.pdf', '.xlsx', '.xls', '.pptx', '.ppt', '.html', '.htm', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
}


// Default upload (any file, no filter)
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// PDF specific upload
const pdfUpload = multer({
  storage,
  fileFilter: pdfFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Image specific upload
const imageUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Document specific upload
const documentUpload = multer({
  storage,
  fileFilter: strictDocumentFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

module.exports = {
  upload,
  pdfUpload,
  imageUpload,
  documentUpload
};
