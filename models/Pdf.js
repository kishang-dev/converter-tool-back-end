const mongoose = require("mongoose");

// Enhanced PDF schema to store more data including OCR text
const pdfSchema = new mongoose.Schema({
  fileName: String,
  textContent: String, // Pure overall text content from pdf-parse (now includes OCR text)
  htmlContent: String, // HTML formatted content derived from richer data
  originalFile: Buffer, // Original PDF file binary
  pages: [
    {
      pageNumber: Number,
      content: String, // Text content specific to this page (from pdf.js-extract + OCR)
      textItems: Array, // Array of {x, y, str, fontName, height, etc.}
      imageData: Buffer, // Page as image (PNG from pdf-poppler)
      ocrText: { type: String, default: "" }, // OCR extracted text from page image
    },
  ],
  metadata: {
    totalPages: Number,
    title: String,
    author: String,
    subject: String,
    keywords: String,
    creator: String,
    producer: String,
    creationDate: { type: Date, default: null },
    modificationDate: { type: Date, default: null },
    fileSize: Number,
  },
  processingStatus: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing",
  },
  createdAt: { type: Date, default: Date.now },
});

// Index for better search performance
pdfSchema.index({ fileName: 1 });
pdfSchema.index({ "metadata.title": 1 });
pdfSchema.index({ processingStatus: 1 });
pdfSchema.index({ "pages.ocrText": "text" }); // Text index for OCR search

const Pdf = mongoose.model("Pdf", pdfSchema);

module.exports = Pdf;
