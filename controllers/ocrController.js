const OcrData = require("../models/OcrData");
const { performOcrAndSave } = require("../utils/ocrProcessor");

const uploadAndOcr = async (req, res, next) => {
  console.log("OCR request received");

  if (!req.file) {
    console.log("No file uploaded");
    return res.status(400).json({ message: "No image file uploaded." });
  }

  const imagePath = req.file.path;
  const originalFilename = req.file.originalname;
  try {
    const extractedDataWithStats = await performOcrAndSave(
      imagePath,
      originalFilename
    );

    res.status(200).json({
      message: "OCR successful and data saved to MongoDB!",
      success: true,
      data: extractedDataWithStats,
      stats: extractedDataWithStats.stats,
    });
  } catch (error) {
    console.error("Error during OCR process or MongoDB save:", error);
    console.error("Error stack:", error.stack);

    // Specific error handling for duplicate keys (imageId)
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "This image (or an image with the same generated ID) has already been processed and saved.",
        error: error.message,
      });
    }

    // Pass other errors to the global error handler
    next(error);
  }
};

const getOcrData = async (req, res, next) => {
  try {
    const { imageId } = req.params;
    const ocrData = await OcrData.findOne({ imageId });

    if (!ocrData) {
      return res.status(404).json({
        message: "OCR data not found for the specified image ID.",
      });
    }

    res.status(200).json({
      message: "OCR data retrieved successfully",
      data: ocrData,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadAndOcr,
  getOcrData,
};
