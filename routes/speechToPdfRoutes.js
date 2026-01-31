const express = require("express");
const router = express.Router();
const { generatePdfFromText } = require("../controllers/speechToPdfController");

const { checkUsage } = require("../middleware/authMiddleware");

router.post("/speech-to-pdf/generate", checkUsage, generatePdfFromText);

module.exports = router;
