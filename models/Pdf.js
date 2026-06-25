const mongoose = require("mongoose");

const pdfSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  originalFile: {
    type: Buffer, // Store original PDF buffer
    select: false, // Don't return by default
  },

  // Ownership
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  guestId: {
    type: String
  },

  metadata: {
    title: String,
    author: String,
    subject: String,
    keywords: String,
    producer: String,
    creationDate: Date,
    modificationDate: Date,
    totalPages: Number,
    fileSize: Number, // in bytes
  },
  textContent: {
    type: String, // Allow storing full text content
  },
  htmlContent: {
    type: String, // Allow storing basic HTML structure
  },

  // Array of page objects
  pages: [
    {
      pageNumber: { type: Number, required: true },
      textItems: [], // Raw text items with positions if needed
      content: String, // Plain text content of the page
      imageData: Buffer, // Store page image (png) buffer
      width: Number,
      height: Number,
      ocrText: String, // Store OCR text for this page
    },
  ],

  processingStatus: {
    type: String,
    enum: ["pending", "processed", "failed", "processing"],
    default: "pending",
  },
  errorMessage: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Pdf", pdfSchema);
