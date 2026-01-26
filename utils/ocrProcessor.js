// pdf-parser-api/utils/ocrProcessor.js
const Tesseract = require("tesseract.js");
const path = require("path");
const fs = require("fs");
const OcrData = require("../models/OcrData"); // Import the OCR data model

const DEFAULT_OCR_LANGUAGES = "eng+hin+guj"; // English, Hindi, Gujarati

async function performOcrAndSave(imagePath, originalFilename) {
  const imageId = path.basename(imagePath, path.extname(imagePath));

  console.log(`Attempting OCR with languages: ${DEFAULT_OCR_LANGUAGES}`);

  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Uploaded file not found at path: ${imagePath}`);
    }

    console.log("Starting OCR process...");

    const { data } = await Tesseract.recognize(
      imagePath,
      DEFAULT_OCR_LANGUAGES,
      {
        logger: (m) => {
          if (m.status === "recognizing text") {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          } else if (m.status === "loading language traineddata") {
            console.log(
              `Loading language data for ${m.userJobId}: ${Math.round(
                m.progress * 100
              )}%`
            );
          }
        },
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: "1",
      }
    );

    console.log("OCR completed successfully");
    console.log(`Overall confidence: ${data.confidence}`);
    console.log(`Text length: ${data.text ? data.text.length : 0} characters`);

    const fullText = data.text || "";

    let recognizedWords = [];
    // Flatten words from different levels (words, lines, paragraphs)
    if (data.words && Array.isArray(data.words)) {
      recognizedWords = data.words.filter(
        (word) => word && word.text && word.text.trim()
      );
    } else if (data.lines && Array.isArray(data.lines)) {
      recognizedWords = data.lines.flatMap((line) =>
        line.words && Array.isArray(line.words)
          ? line.words.filter((word) => word && word.text && word.text.trim())
          : []
      );
    } else if (data.paragraphs && Array.isArray(data.paragraphs)) {
      recognizedWords = data.paragraphs.flatMap((para) =>
        para.lines && Array.isArray(para.lines)
          ? para.lines.flatMap((line) =>
              line.words && Array.isArray(line.words)
                ? line.words.filter(
                    (word) => word && word.text && word.text.trim()
                  )
                : []
            )
          : []
      );
    }

    console.log(`Extracted ${recognizedWords.length} words`);

    if (fullText.length > 0) {
      console.log(
        `Sample text: "${fullText.substring(0, 100)}${
          fullText.length > 100 ? "..." : ""
        }"`
      );
    } else {
      console.log("Warning: No text extracted from image. Possible reasons:");
      console.log("- Poor image quality or no readable text.");
      console.log("- Image format issues or needs preprocessing.");
      console.log(
        "- The text is in a language not covered by the default set."
      );
    }

    const extractedData = {
      imageId: imageId,
      originalFilename: originalFilename,
      fullText: fullText,
      languagesAttempted: DEFAULT_OCR_LANGUAGES,
      words: recognizedWords.map((word) => ({
        text: word.text || "",
        bbox: word.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
        confidence: word.confidence || 0,
      })),
    };

    console.log("Saving to MongoDB...");
    const newOcrEntry = new OcrData(extractedData);
    await newOcrEntry.save();
    console.log(`OCR data for ${originalFilename} saved to MongoDB.`);

    return {
      ...extractedData,
      stats: {
        textLength: fullText.length,
        wordCount: recognizedWords.length,
        confidence: Math.round(data.confidence || 0),
        languagesAttempted: DEFAULT_OCR_LANGUAGES,
      },
    };
  } finally {
    // Ensure the uploaded file is always deleted
    if (fs.existsSync(imagePath)) {
      fs.unlink(imagePath, (err) => {
        if (err) {
          console.error(`Error deleting file ${imagePath}:`, err);
        } else {
          console.log(
            `Successfully deleted temporary image file: ${imagePath}`
          );
        }
      });
    }
  }
}

module.exports = {
  performOcrAndSave,
  DEFAULT_OCR_LANGUAGES, // Export if you want to expose this constant
};
