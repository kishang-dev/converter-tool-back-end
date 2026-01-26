const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const { PDFExtract } = require("pdf.js-extract");
const Tesseract = require("tesseract.js");

const Pdf = require("../models/Pdf");
const { parsePDFDate } = require("./helpers");
const { generateHTMLContent } = require("./htmlGenerator");

async function processPDF(filePath, originalName) {
  let pdfDoc = null;

  try {
    console.log(`Starting to process PDF: ${originalName}`);

    const pdfBuffer = fs.readFileSync(filePath);

    // --- Use pdf-parse for overall text and metadata ---
    const pdfParseData = await pdf(pdfBuffer, {
      max: 0, // Parse all pages
    });

    console.log(
      `Extracted ${pdfParseData.numpages} pages metadata from pdf-parse.`
    );

    // --- Use pdf.js-extract for accurate page-specific text content and items ---
    const extractor = new PDFExtract();
    const pdfExtractData = await extractor.extract(filePath, {
      verbosity: -1,
    });

    const pageContentForDB = [];
    const pageTextItemsForDB = [];

    if (pdfExtractData && pdfExtractData.pages) {
      pdfExtractData.pages.forEach((page) => {
        const pageText = page.content
          .map((item) => item.str)
          .join(" ")
          .trim();
        pageContentForDB.push(pageText);
        pageTextItemsForDB.push(page.content);
      });
      console.log(
        `Extracted text and text items for ${pageContentForDB.length} individual pages using pdf.js-extract.`
      );
    } else {
      console.warn(
        "pdf.js-extract failed to extract page content. Falling back to overall text distribution."
      );
      const textLines = pdfParseData.text.split("\n");
      const linesPerPage =
        Math.ceil(textLines.length / pdfParseData.numpages) || 1;
      for (let i = 0; i < pdfParseData.numpages; i++) {
        const startLine = i * linesPerPage;
        const endLine = Math.min(startLine + linesPerPage, textLines.length);
        const pageContent = textLines
          .slice(startLine, endLine)
          .join("\n")
          .trim();
        pageContentForDB.push(
          pageContent || `Could not extract specific text for page ${i + 1}.`
        );
        pageTextItemsForDB.push([]);
      }
    }

    // Create initial document entry in MongoDB
    pdfDoc = new Pdf({
      fileName: originalName,
      textContent: pdfParseData.text,
      originalFile: pdfBuffer,
      metadata: {
        totalPages: pdfParseData.numpages,
        title: pdfParseData.info?.Title || "",
        author: pdfParseData.info?.Author || "",
        subject: pdfParseData.info?.Subject || "",
        keywords: pdfParseData.info?.Keywords || "",
        creator: pdfParseData.info?.Creator || "",
        producer: pdfParseData.info?.Producer || "",
        creationDate: parsePDFDate(pdfParseData.info?.CreationDate),
        modificationDate: parsePDFDate(pdfParseData.info?.ModDate),
        fileSize: pdfBuffer.length,
      },
      processingStatus: "processing",
    });

    await pdfDoc.save();

    // --- Process with pdf-poppler for page images ---
    const pageImagesData = new Array(pdfParseData.numpages).fill(null);
    const ocrTextData = new Array(pdfParseData.numpages).fill("");

    try {
      const imagesBuffers = await processWithPdfPoppler(
        filePath,
        pdfDoc._id,
        pdfParseData.numpages
      );

      if (imagesBuffers && imagesBuffers.length > 0) {
        // Process each page image for OCR
        for (let i = 0; i < imagesBuffers.length; i++) {
          if (imagesBuffers[i]) {
            pageImagesData[i] = imagesBuffers[i];

            // Perform OCR on the page image with multiple languages
            try {
              console.log(`Performing OCR on page ${i + 1}...`);
              // *** KEY CHANGE HERE: Specify multiple languages for Tesseract ***
              const ocrResult = await performOCR(
                imagesBuffers[i],
                "eng+guj+hin"
              );
              ocrTextData[i] = ocrResult;
              console.log(`OCR completed for page ${i + 1}`);
            } catch (ocrError) {
              console.warn(`OCR failed for page ${i + 1}:`, ocrError.message);
              ocrTextData[i] = "";
            }
          }
        }

        console.log(
          `pdf-poppler processed successfully and generated ${
            imagesBuffers.filter(Boolean).length
          } page images with OCR text extraction.`
        );
      } else {
        console.warn(
          "pdf-poppler executed, but no image buffers were returned or generated."
        );
      }
    } catch (popplerError) {
      console.warn(
        `pdf-poppler processing failed for ${originalName}: ${popplerError.message}. ` +
          `This is likely due to Poppler utilities not being installed or configured in PATH. ` +
          `Proceeding without page images and OCR.`
      );
    }

    // --- Combine page text, text items, image data, and OCR text ---
    pdfDoc.pages = [];
    let combinedTextContent = pdfParseData.text;

    for (let i = 0; i < pdfParseData.numpages; i++) {
      const originalPageText =
        pageContentForDB[i] || `No text content found for page ${i + 1}.`;
      const ocrText = ocrTextData[i] || "";

      // Combine original extracted text with OCR text
      let combinedPageText = originalPageText;
      if (ocrText.trim() && !isTextSimilar(originalPageText, ocrText)) {
        combinedPageText += "\n\n--- OCR Extracted Text ---\n" + ocrText;

        // Add OCR text to overall document text content
        combinedTextContent +=
          "\n\n--- Page " + (i + 1) + " OCR Text ---\n" + ocrText;
      }

      pdfDoc.pages.push({
        pageNumber: i + 1,
        content: combinedPageText,
        textItems: pageTextItemsForDB[i] || [],
        imageData: pageImagesData[i],
        ocrText: ocrText, // Store OCR text separately
      });
    }

    // Update the combined text content
    pdfDoc.textContent = combinedTextContent;

    // Generate HTML content using the detailed text items
    pdfDoc.htmlContent = generateHTMLContent(pdfExtractData, pdfDoc.metadata);

    // Update final status to completed
    pdfDoc.processingStatus = "completed";
    await pdfDoc.save();

    console.log(`PDF processing with OCR completed for: ${originalName}`);
    return pdfDoc;
  } catch (error) {
    console.error(`PDF processing error for ${originalName}:`, error);

    if (pdfDoc && pdfDoc._id) {
      pdfDoc.processingStatus = "failed";
      await pdfDoc.save().catch((err) => {
        console.error("Failed to update document status to 'failed':", err);
      });
    }

    throw error;
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up temporary uploaded file: ${filePath}`);
    }
  }
}

async function processWithPdfPoppler(filePath, docId, totalPages) {
  let pdfPoppler;
  try {
    pdfPoppler = require("pdf-poppler");
  } catch (requireError) {
    throw new Error(
      "The 'pdf-poppler' module is not installed. Please install it: `npm install pdf-poppler`. " +
        "Also, ensure Poppler command-line utilities are installed on your system (e.g., `sudo apt-get install poppler-utils` on Ubuntu)."
    );
  }

  const outputPrefix = `pdf_${docId}`;
  const options = {
    format: "png",
    out_dir: "./temp",
    out_prefix: outputPrefix,
    page: null,
    // Increase DPI for better OCR results
    density: 300,
  };

  console.log(
    `Converting ${totalPages} PDF pages to images using pdf-poppler...`
  );
  try {
    await pdfPoppler.convert(filePath, options);
  } catch (conversionError) {
    throw new Error(
      `pdf-poppler conversion failed: ${conversionError.message}. Check Poppler installation.`
    );
  }

  const imageBuffers = [];
  for (let i = 0; i < totalPages; i++) {
    const pageNumber = i + 1;
    const imagePath = path.join(
      options.out_dir,
      `${outputPrefix}-${pageNumber}.png`
    );

    let imageData = null;
    if (fs.existsSync(imagePath)) {
      imageData = fs.readFileSync(imagePath);
      fs.unlinkSync(imagePath);
    }
    imageBuffers.push(imageData);
  }
  return imageBuffers;
}

// New function to perform OCR on image buffer
async function performOCR(imageBuffer, lang = "eng") {
  // Added lang parameter with default 'eng'
  try {
    const {
      data: { text },
    } = await Tesseract.recognize(imageBuffer, lang, {
      // Use the lang parameter here
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    return text.trim();
  } catch (error) {
    console.error("OCR processing error:", error);
    throw error;
  }
}

// Helper function to check if extracted text and OCR text are similar
function isTextSimilar(text1, text2, threshold = 0.8) {
  if (!text1 || !text2) return false;

  const normalize = (str) => str.toLowerCase().replace(/\s+/g, " ").trim();
  const normalized1 = normalize(text1);
  const normalized2 = normalize(text2);

  if (normalized1.length === 0 || normalized2.length === 0) return false;

  // Simple similarity check based on common words
  const words1 = new Set(normalized1.split(" "));
  const words2 = new Set(normalized2.split(" "));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const similarity = intersection.size / union.size;
  return similarity > threshold;
}

module.exports = {
  processPDF,
  processWithPdfPoppler,
  performOCR,
};
