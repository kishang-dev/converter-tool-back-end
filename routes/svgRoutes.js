const express = require("express");
const router = express.Router();
const svgController = require("../controllers/svgController");
const { imageUpload } = require("../middleware/upload");

const { checkUsage } = require("../middleware/authMiddleware");

router.post("/upload-svg", checkUsage, imageUpload.single("image"), svgController.convertImageToSVG);
router.post("/analyze-colors", checkUsage, imageUpload.single("image"), svgController.analyzeColors);
router.post("/update-svg-colors", checkUsage, svgController.updateSVGColors);

module.exports = router;
