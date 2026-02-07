const express = require('express');
const router = express.Router();
const conversionController = require('../controllers/conversionController');
const { protect } = require('../middleware/authMiddleware'); // Assuming auth exists

// Conversion routes
// Add 'protect' middleware if authentication is required, or leave open for guests if handled in controller
router.post('/pdf-to-pptx', conversionController.pdfToPptx);
router.post('/excel-to-pdf', conversionController.excelToPdf);
router.post('/ppt-to-pdf', conversionController.pptToPdf);
router.post('/html-to-pdf', conversionController.htmlToPdf);
router.post('/pdf-to-text', conversionController.pdfToText);
router.post('/pdf-to-html', conversionController.pdfToHtml);

module.exports = router;
