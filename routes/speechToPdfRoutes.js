const express = require("express");
const router = express.Router();
const { generatePdfFromText } = require("../controllers/speechToPdfController");

router.post("/speech-to-pdf/generate", generatePdfFromText);

module.exports = router;
