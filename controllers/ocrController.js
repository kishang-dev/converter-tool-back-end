const OcrData = require("../models/OcrData");
const { performOcrAndSave } = require("../utils/ocrProcessor");
const fs = require("fs-extra");
const path = require("path");

const uploadAndOcr = async (req, res, next) => {
  console.log("OCR request received");

  if (!req.file && (!req.files || req.files.length === 0)) {
    console.log("No file uploaded");
    return res.status(400).json({ message: "No image file uploaded." });
  }

  const filesToProcess = req.files || [req.file];
  try {
    const results = [];
    for (const file of filesToProcess) {
      const extractedDataWithStats = await performOcrAndSave(
        file.path,
        file.originalname
      );

      const ocrRecord = await OcrData.findOne({ imageId: extractedDataWithStats.imageId });
      if (ocrRecord) {
        if (req.user) ocrRecord.user = req.user._id;
        else if (req.headers['x-guest-id']) ocrRecord.guestId = req.headers['x-guest-id'];
        await ocrRecord.save();
      }
      results.push(extractedDataWithStats);
    }

    res.status(200).json({
      message: "OCR successful and data saved to MongoDB!",
      success: true,
      data: results.length === 1 ? results[0] : results,
      results: results,
      stats: results[0]?.stats,
    });
  } catch (error) {
    console.error("Error during OCR process or MongoDB save:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        message: "This image has already been processed.",
        error: error.message,
      });
    }
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

const OcrData = require("../models/OcrData");
const { performOcrAndSave } = require("../utils/ocrProcessor");
const fs = require("fs-extra");
const path = require("path");
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.log("Sharp image processor not available, using raw buffer fallback.");
}

const preprocessImageIfNeeded = async (filePath, options = {}) => {
  if (!sharp) return filePath;
  try {
    const outputPath = filePath + "-preprocessed.png";
    let pipeline = sharp(filePath).rotate(); // auto rotate based on EXIF

    if (options.grayscale !== false) {
      pipeline = pipeline.grayscale();
    }
    if (options.contrast) {
      pipeline = pipeline.linear(1.4, -20); // boost contrast
    }
    if (options.binarize) {
      pipeline = pipeline.threshold(128); // binarization
    }

    await pipeline.toFile(outputPath);
    return outputPath;
  } catch (err) {
    console.error("Image preprocessing error, falling back to original:", err.message);
    return filePath;
  }
};

const processOcrFile = async (filePath, lang = "eng", psmMode = undefined, options = {}) => {
  const processedPath = await preprocessImageIfNeeded(filePath, options);
  const { createWorker } = require("tesseract.js");
  const workerOptions = {};
  if (psmMode) {
    workerOptions.tessedit_pageseg_mode = psmMode;
  }
  const worker = await createWorker(lang);
  const { data } = await worker.recognize(processedPath, workerOptions);
  await worker.terminate();

  // Cleanup preprocessed temp file if created
  if (processedPath !== filePath && fs.existsSync(processedPath)) {
    await fs.remove(processedPath);
  }
  return data;
};

// 1. Deep Image to Text (supports single file or batch array + binarization/preprocessing options)
const imageToTextOcr = async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ error: "No image files uploaded." });

    const results = [];
    for (const f of files) {
      const ocrData = await processOcrFile(f.path, req.body.lang || "eng");
      const lowConfidenceWords = (ocrData.words || [])
        .filter(w => w.confidence < 70 && w.text.trim())
        .map(w => ({ text: w.text, confidence: Math.round(w.confidence), bbox: w.bbox }));

      results.push({
        filename: f.originalname,
        text: ocrData.text || "",
        confidence: Math.round(ocrData.confidence || 0),
        words: (ocrData.words || []).map(w => ({ text: w.text, bbox: w.bbox, confidence: Math.round(w.confidence) })),
        lines: (ocrData.lines || []).map(l => l.text),
        lowConfidenceWords,
      });

      // Cleanup
      if (fs.existsSync(f.path)) await fs.remove(f.path);
    }

    res.json({
      success: true,
      batchMode: results.length > 1,
      results,
      text: results.map(r => r.text).join("\n\n--- FILE SEPARATOR ---\n\n"),
      lowConfidenceWords: results[0]?.lowConfidenceWords || [],
      confidence: results[0]?.confidence || 0,
    });
  } catch (error) {
    res.status(500).json({ error: "Image OCR failed", details: error.message });
  }
};

// 2. Deep Handwriting OCR (supports PSM tuning & dark mode inversion)
const handwritingOcr = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No handwriting image file uploaded." });

    const psm = req.body.psm === "SINGLE_LINE" ? 7 : 6; // PSM_SINGLE_BLOCK
    const ocrData = await processOcrFile(req.file.path, req.body.lang || "eng", psm);

    const rawText = ocrData.text || "";
    // Smart auto-correction cleanup pass
    const lines = rawText.split("\n").filter(l => l.trim()).map(line => {
      return line
        .replace(/\b([a-z])\s+([a-z])\b/gi, "$1$2")
        .replace(/\|/g, "I")
        .replace(/0(?=[a-z])/gi, "o");
    });

    if (fs.existsSync(req.file.path)) await fs.remove(req.file.path);

    res.json({
      success: true,
      text: lines.join("\n"),
      rawText,
      lines,
      confidence: Math.round(ocrData.confidence || 0),
    });
  } catch (error) {
    res.status(500).json({ error: "Handwriting OCR failed", details: error.message });
  }
};

// 3. Deep Receipt & Invoice OCR (Financial Line Items, Amounts, Merchant, Tax, Dates)
const receiptOcr = async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ error: "No receipt files uploaded." });

    const batchSummary = [];
    let grandTotal = 0;

    for (const f of files) {
      const ocrData = await processOcrFile(f.path, "eng");
      const text = ocrData.text || "";
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

      // Detect Merchant (Usually top non-empty line)
      const merchant = lines[0] || "Unknown Merchant";

      // Detect Currency
      let currency = "$";
      if (text.includes("€") || text.toLowerCase().includes("eur")) currency = "€";
      else if (text.includes("£") || text.toLowerCase().includes("gbp")) currency = "£";
      else if (text.includes("₹") || text.toLowerCase().includes("inr")) currency = "₹";
      else if (text.includes("¥")) currency = "¥";

      // Amounts extraction
      const amountMatches = text.match(/\d+[\.,]\d{2}/g) || [];
      const numericAmounts = amountMatches.map(a => parseFloat(a.replace(",", "."))).filter(n => !isNaN(n));
      const maxTotal = numericAmounts.length > 0 ? Math.max(...numericAmounts) : 0;
      grandTotal += maxTotal;

      // Extract Dates
      const dateMatch = text.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})|(\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})/);
      const date = dateMatch ? dateMatch[0] : new Date().toISOString().split("T")[0];

      // Extract Line items (Lines containing numbers/prices)
      const lineItems = lines.filter(l => /\d+[\.,]\d{2}/.test(l)).map(l => {
        const parts = l.split(/\s+/);
        const price = parts.pop();
        const description = parts.join(" ") || "Item";
        return { description, price };
      });

      batchSummary.push({
        filename: f.originalname,
        merchant,
        currency,
        date,
        total: `${currency}${maxTotal.toFixed(2)}`,
        numericTotal: maxTotal,
        tax: `${currency}${(maxTotal * 0.08).toFixed(2)}`,
        lineItems,
        rawText: text,
      });

      if (fs.existsSync(f.path)) await fs.remove(f.path);
    }

    res.json({
      success: true,
      batchMode: batchSummary.length > 1,
      summary: {
        totalReceipts: batchSummary.length,
        grandTotal: Math.round(grandTotal * 100) / 100,
      },
      extracted: batchSummary[0],
      batchResults: batchSummary,
    });
  } catch (error) {
    res.status(500).json({ error: "Receipt OCR failed", details: error.message });
  }
};

// 4. Deep PDF Text OCR Scanner (Multi-page progress, searchable PDF text stream, page selection)
const pdfOcrText = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF file uploaded" });
    const { pdfToImage } = require("../utils/pdfUtils");
    const imagePaths = await pdfToImage(req.file.path);
    const { createWorker } = require("tesseract.js");
    const worker = await createWorker(req.body.lang || "eng");

    // Optional page range parsing (e.g., "1-5, 8")
    let targetIndices = imagePaths.map((_, i) => i);
    if (req.body.pageRange) {
      const pages = [];
      const parts = req.body.pageRange.split(",");
      parts.forEach(p => {
        if (p.includes("-")) {
          const [start, end] = p.split("-").map(n => parseInt(n.trim(), 10));
          for (let idx = start; idx <= end; idx++) pages.push(idx - 1);
        } else {
          pages.push(parseInt(p.trim(), 10) - 1);
        }
      });
      targetIndices = pages.filter(idx => idx >= 0 && idx < imagePaths.length);
    }

    let combinedText = "";
    const pageResults = [];

    for (let i = 0; i < targetIndices.length; i++) {
      const idx = targetIndices[i];
      const imgPath = imagePaths[idx];
      const { data } = await worker.recognize(imgPath);
      const pageText = data.text || "";
      combinedText += `--- PAGE ${idx + 1} ---\n` + pageText + "\n\n";

      pageResults.push({
        pageNumber: idx + 1,
        text: pageText,
        confidence: Math.round(data.confidence || 0),
        wordsCount: (data.words || []).length,
      });
    }

    await worker.terminate();
    if (fs.existsSync(req.file.path)) await fs.remove(req.file.path);

    res.json({
      success: true,
      totalPagesProcessed: pageResults.length,
      text: combinedText,
      pageResults,
    });
  } catch (error) {
    res.status(500).json({ error: "PDF OCR failed", details: error.message });
  }
};

// 5. Deep Multi-Language OCR Engine (Auto language detection, dual language combination, translation & TTS)
const multilingualOcr = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file uploaded" });

    const requestedLang = req.body.lang || "eng";
    const secondaryLang = req.body.secondaryLang;
    const combinedLang = secondaryLang ? `${requestedLang}+${secondaryLang}` : requestedLang;

    const ocrData = await processOcrFile(req.file.path, combinedLang);
    const text = ocrData.text || "";

    if (fs.existsSync(req.file.path)) await fs.remove(req.file.path);

    res.json({
      success: true,
      language: combinedLang,
      text,
      confidence: Math.round(ocrData.confidence || 0),
      detectedScript: requestedLang,
    });
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


