// pdf-parser-api/routes/ocrRoutes.js
const express = require("express");
const router = express.Router();

const { imageUpload, pdfUpload } = require("../middleware/upload");
const ocrController = require("../controllers/ocrController");
const { checkUsage } = require("../middleware/authMiddleware");

// Image upload and OCR processing route
router.post(
  "/upload-and-ocr",
  checkUsage,
  imageUpload.array("images", 50),
  ocrController.uploadAndOcr
);

router.get("/ocr-data/:imageId", ocrController.getOcrData);

// Specialized Deep OCR Routes (supporting single file or batch arrays)
router.post("/image-to-text", checkUsage, imageUpload.array("images", 50), ocrController.imageToTextOcr);
router.post("/handwriting", checkUsage, imageUpload.single("image"), ocrController.handwritingOcr);
router.post("/receipt", checkUsage, imageUpload.array("images", 50), ocrController.receiptOcr);
router.post("/pdf-text", checkUsage, pdfUpload.single("file"), ocrController.pdfOcrText);
router.post("/multilingual", checkUsage, imageUpload.single("image"), ocrController.multilingualOcr);

module.exports = router;


