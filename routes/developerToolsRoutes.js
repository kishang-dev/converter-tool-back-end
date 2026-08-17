const express = require('express');
const router = express.Router();
const developerToolsController = require('../controllers/developerToolsController');

// Base64
router.post('/base64/encode', developerToolsController.base64Encode);
router.post('/base64/decode', developerToolsController.base64Decode);

// JSON Tools
router.post('/json/format', developerToolsController.formatJson);
router.post('/json/minify', developerToolsController.minifyJson);
router.post('/json/validate', developerToolsController.validateJson);

// XML Tools
router.post('/xml/to-json', developerToolsController.xmlToJson);
router.post('/xml/from-json', developerToolsController.jsonToXml);

// SQL Formatting
router.post('/sql/format', developerToolsController.formatSql);

// Code Minifier
router.post('/code/minify', developerToolsController.minifyCode);

// Hash & UUID Generator
router.post('/hash/generate', developerToolsController.generateHashes);

// URL Encoder / Decoder
router.post('/url/process', developerToolsController.processUrl);

// Formatting & Utilities
router.post('/html/format', developerToolsController.formatHtml);
router.post('/css/format', developerToolsController.formatCss);
router.post('/js/format', developerToolsController.formatJs);
router.post('/case/convert', developerToolsController.convertCase);
router.post('/text/diff', developerToolsController.compareTextDiff);

module.exports = router;


