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

    // Update ownership logic
    const OcrData = require("../models/OcrData");
    const ocrRecord = await OcrData.findOne({ imageId: extractedDataWithStats.imageId });
    if (ocrRecord) {
      if (req.user) ocrRecord.user = req.user._id;
      else if (req.headers['x-guest-id']) ocrRecord.guestId = req.headers['x-guest-id'];
      await ocrRecord.save();
    }

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

const processOcrFile = async (req, lang = "eng") => {
  if (!req.file) throw new Error("No file uploaded.");
  const { createWorker } = require("tesseract.js");
  const worker = await createWorker(lang);
  const { data: { text } } = await worker.recognize(req.file.path);
  await worker.terminate();
  return text;
};

const imageToTextOcr = async (req, res) => {
  try {
    const text = await processOcrFile(req, "eng");
    res.json({ success: true, text });
  } catch (error) {
    res.status(500).json({ error: "Image OCR failed", details: error.message });
  }
};

const handwritingOcr = async (req, res) => {
  try {
    const text = await processOcrFile(req, "eng");
    res.json({ success: true, text });
  } catch (error) {
    res.status(500).json({ error: "Handwriting OCR failed", details: error.message });
  }
};

const receiptOcr = async (req, res) => {
  try {
    const text = await processOcrFile(req, "eng");
    const lines = text.split("\n").filter((l) => l.trim());
    const amounts = text.match(/\d+[\.,]\d{2}/g) || [];
    res.json({ success: true, rawText: text, extracted: { lines, amounts, total: amounts[amounts.length - 1] || "N/A" } });
  } catch (error) {
    res.status(500).json({ error: "Receipt OCR failed", details: error.message });
  }
};

const pdfOcrText = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF file uploaded" });
    const { pdfToImage } = require("../utils/pdfUtils");
    const imagePaths = await pdfToImage(req.file.path);
    const { createWorker } = require("tesseract.js");
    const worker = await createWorker("eng");
    
    let combinedText = "";
    for (const imgPath of imagePaths) {
      const { data: { text } } = await worker.recognize(imgPath);
      combinedText += text + "\n\n";
    }
    await worker.terminate();
    res.json({ success: true, text: combinedText });
  } catch (error) {
    res.status(500).json({ error: "PDF OCR failed", details: error.message });
  }
};

const multilingualOcr = async (req, res) => {
  try {
    const { lang = "eng" } = req.body;
    const text = await processOcrFile(req, lang);
    res.json({ success: true, language: lang, text });
  } catch (error) {
    res.status(500).json({ error: "Multilingual OCR failed", details: error.message });
  }
};

module.exports = {
  uploadAndOcr,
  getOcrData,
  imageToTextOcr,
  handwritingOcr,
  receiptOcr,
  pdfOcrText,
  multilingualOcr,
};

