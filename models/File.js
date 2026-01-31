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
        "content-edit"
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
