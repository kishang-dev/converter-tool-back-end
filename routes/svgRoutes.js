const express = require("express");
const router = express.Router();
const svgController = require("../controllers/svgController");
const { imageUpload } = require("../middleware/upload");

router.post("/upload-svg", imageUpload.single("image"), svgController.convertImageToSVG);
router.post("/analyze-colors", imageUpload.single("image"), svgController.analyzeColors);
router.post("/update-svg-colors", svgController.updateSVGColors);

module.exports = router;
