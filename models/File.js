const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    guestId: {
      type: String
    },
    originalName: {
      type: String,
      required: true,
    },
    path: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    operation: {
      type: String,
      enum: [
        "upload",
        "merge",
        "split",
        "compress",
        "convert",
        "rotate",
        "protect",
        "image",
        "convert-image",
        "edit",
        "content-edit",
        "convert-pdf-to-pptx",
        "convert-excel-to-pdf",
        "convert-ppt-to-pdf",
        "convert-html-to-pdf",
        "convert-pdf-to-text",
        "convert-pdf-to-html",
        "convert-word-to-pdf",
        "convert-image-to-png",
        "convert-image-to-jpg",
        "convert-image-to-jpeg",
        "convert-image-to-webp",
        "convert-text-to-pdf",
        "convert-csv-to-pdf",
        "convert-pdf-to-csv",
        "convert-video-to-pdf",
        "convert-audio-to-pdf",
        "convert-image",
        "convert-pdf-to-speech"
      ],
      default: "upload",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("File", fileSchema);
