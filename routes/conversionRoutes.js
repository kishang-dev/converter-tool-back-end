const express = require('express');
const router = express.Router();
const conversionController = require('../controllers/conversionController');
const extraConversionController = require('../controllers/extraConversionController');
const { protect } = require('../middleware/authMiddleware'); // Assuming auth exists
const multer = require('multer');
const upload = multer({ dest: 'temp/' });

// Conversion routes
// Add 'protect' middleware if authentication is required, or leave open for guests if handled in controller
router.post('/pdf-to-pptx', conversionController.pdfToPptx);
router.post('/excel-to-pdf', conversionController.excelToPdf);
router.post('/ppt-to-pdf', extraConversionController.pptToPdf); // Updated to new text extraction method
router.post('/html-to-pdf', conversionController.htmlToPdf);
router.post('/pdf-to-text', conversionController.pdfToText);
router.post('/pdf-to-html', conversionController.pdfToHtml);

// Extra Conversions
router.post('/word-to-pdf', extraConversionController.wordToPdf);
router.post('/image-convert', extraConversionController.imageConvert);
router.post('/text-to-pdf', extraConversionController.textToPdf);
router.post('/csv-to-pdf', extraConversionController.csvToPdf);
router.post('/pdf-to-csv', extraConversionController.pdfToCsv);
router.post('/pdf-to-speech', extraConversionController.pdfToSpeech);
router.post('/video-to-pdf', extraConversionController.videoToPdf);
router.post('/audio-to-pdf', extraConversionController.audioToPdf);
router.post('/transcribe-file', extraConversionController.transcribeFile);
router.post('/transcribe-chunk', upload.single('audio'), extraConversionController.transcribeChunk);
router.post('/svg-to-image', extraConversionController.svgToImage);
router.post('/image-watermark', extraConversionController.watermarkImage);
router.post('/image-compress', extraConversionController.compressImage);
router.post('/png-to-webp', extraConversionController.pngToWebp);
router.post('/jpg-to-webp', extraConversionController.jpgToWebp);
router.post('/image-palette', extraConversionController.extractPalette);
router.post('/optimize-svg', extraConversionController.optimizeSvg);
router.post('/word-to-text', extraConversionController.wordToText);
router.post('/excel-to-csv', extraConversionController.excelToCsv);
router.post('/csv-to-excel', extraConversionController.csvToExcel);
router.post('/text-to-word', extraConversionController.textToWord);
router.post('/html-to-word', extraConversionController.htmlToWord);
router.post('/text-to-image', extraConversionController.textToImage);




// YAML ↔ JSON & CSV ↔ JSON Converters
router.post('/yaml-to-json', conversionController.yamlToJson);
router.post('/json-to-yaml', conversionController.jsonToYaml);
router.post('/csv-to-json', conversionController.csvToJson);
router.post('/json-to-csv', conversionController.jsonToCsv);
router.post('/heic-to-jpg', conversionController.convertHeic);

module.exports = router;
