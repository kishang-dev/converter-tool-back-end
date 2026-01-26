// pdf-parser-api/models/OcrData.js
const mongoose = require("mongoose");

// --- Mongoose Schema for OCR Data ---
const OcrDataSchema = new mongoose.Schema({
  imageId: { type: String, required: true, unique: true },
  originalFilename: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  fullText: { type: String, required: true },
  languagesAttempted: { type: String, required: true }, // Languages used for OCR
  words: [
    {
      text: String,
      bbox: {
        x0: Number,
        y0: Number,
        x1: Number,
        y1: Number,
      },
      confidence: Number,
    },
  ],
});

const OcrData = mongoose.model("OcrData", OcrDataSchema);

module.exports = OcrData;
