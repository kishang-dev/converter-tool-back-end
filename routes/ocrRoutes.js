// pdf-parser-api/routes/ocrRoutes.js
const express = require("express");
const router = express.Router();

const { imageUpload } = require("../middleware/upload"); // Import image upload middleware
const ocrController = require("../controllers/ocrController"); // Import OCR controller

const { checkUsage } = require("../middleware/authMiddleware");

// Image upload and OCR processing route
router.post(
  "/upload-and-ocr",
  checkUsage,
  imageUpload.single("image"),
  ocrController.uploadAndOcr
);

// Retrieve OCR data by image ID
router.get("/ocr-data/:imageId", ocrController.getOcrData);

module.exports = router;
