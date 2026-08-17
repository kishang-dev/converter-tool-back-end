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

router.get("/ocr-data/:imageId", ocrController.getOcrData);

// Specialized OCR Routes
router.post("/image-to-text", checkUsage, imageUpload.single("image"), ocrController.imageToTextOcr);
router.post("/handwriting", checkUsage, imageUpload.single("image"), ocrController.handwritingOcr);
router.post("/receipt", checkUsage, imageUpload.single("image"), ocrController.receiptOcr);
router.post("/pdf-text", checkUsage, imageUpload.single("file"), ocrController.pdfOcrText);
router.post("/multilingual", checkUsage, imageUpload.single("image"), ocrController.multilingualOcr);

module.exports = router;

