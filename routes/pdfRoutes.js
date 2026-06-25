const express = require("express");
const router = express.Router();

const { pdfUpload } = require("../middleware/upload");
const pdfController = require("../controllers/pdfController");

const { checkUsage } = require("../middleware/authMiddleware");

// PDF upload route
router.post("/upload", checkUsage, pdfUpload.single("pdf"), pdfController.uploadPdf);

// Get PDF general content (text, html, metadata)
router.get("/pdf/:id", pdfController.getPdfContent);

// Get specific page content (text only)
router.get("/pdf/:id/page/:pageNum", pdfController.getPdfPageContent);

// Get specific page image
router.get("/pdf/:id/page/:pageNum/image", pdfController.getPdfPageImage);

// Get original PDF file
router.get("/pdf/:id/original", pdfController.getOriginalPdf);

// List all PDFs (metadata only)
router.get("/pdfs", pdfController.listAllPdfs);

// Delete PDF by ID
router.delete("/pdf/:id", pdfController.deletePdf);

// New endpoint to get only OCR text from a specific page
router.get("/pdf/:id/page/:pageNum/ocr-text", pdfController.getPdfPageOcrText);

// New endpoint to search within OCR text
router.get("/search/ocr", pdfController.searchInOcrText);

module.exports = router;
