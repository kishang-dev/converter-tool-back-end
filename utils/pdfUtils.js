const { PDFDocument, degrees } = require("pdf-lib");
const fs = require("fs-extra");
const path = require("path");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const ExcelJS = require("exceljs");

// Merge multiple PDFs
async function mergePDFs(filePaths) {
  const mergedPdf = await PDFDocument.create();

  for (const filePath of filePaths) {
    const pdfBytes = await fs.readFile(filePath);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  const outputPath = path.join(
    __dirname,
    "../outputs",
    `merged-${Date.now()}.pdf`,
  );
  await fs.writeFile(outputPath, mergedPdfBytes);

  return outputPath;
}

// Split PDF into multiple files
async function splitPDF(filePath, ranges = null) {
  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  const outputPaths = [];

  if (!ranges || ranges.length === 0) {
    // Split each page into separate file
    for (let i = 0; i < totalPages; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);

      const pdfBytes = await newPdf.save();
      const outputPath = path.join(
        __dirname,
        "../outputs",
        `split-page-${i + 1}-${Date.now()}.pdf`,
      );
      await fs.writeFile(outputPath, pdfBytes);
      outputPaths.push(outputPath);
    }
  } else {
    // Split based on ranges
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const newPdf = await PDFDocument.create();
      const start = range.start || 0;
      const end = range.end || totalPages - 1;

      for (
        let pageNum = start;
        pageNum <= end && pageNum < totalPages;
        pageNum++
      ) {
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum]);
        newPdf.addPage(copiedPage);
      }

      const pdfBytes = await newPdf.save();
      const outputPath = path.join(
        __dirname,
        "../outputs",
        `split-${i + 1}-${Date.now()}.pdf`,
      );
      await fs.writeFile(outputPath, pdfBytes);
      outputPaths.push(outputPath);
    }
  }

  return outputPaths;
}

// Compress PDF (basic compression)
async function compressPDF(filePath) {
  const pdfBytes = await fs.readFile(filePath);

  // Validate PDF header
  const header = pdfBytes.subarray(0, 5).toString();
  if (header !== "%PDF-") {
    throw new Error("Invalid PDF file: No PDF header found");
  }

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  // Save with compression
  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });

  const outputPath = path.join(
    __dirname,
    "../outputs",
    `compressed-${Date.now()}.pdf`,
  );
  await fs.writeFile(outputPath, compressedBytes);

  return outputPath;
}

// Rotate PDF
async function rotatePDF(filePath, rotationDegrees = 90) {
  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  pages.forEach((page) => {
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + rotationDegrees));
  });

  const rotatedPdfBytes = await pdfDoc.save();
  const outputPath = path.join(
    __dirname,
    "../outputs",
    `rotated-${Date.now()}.pdf`,
  );
  await fs.writeFile(outputPath, rotatedPdfBytes);

  return outputPath;
}

// Protect PDF
async function protectPDF(filePath, password) {
  const fileBuffer = await fs.readFile(filePath);

  // Validate PDF header
  const header = fileBuffer.subarray(0, 5).toString();
  if (header !== "%PDF-") {
    throw new Error("Invalid PDF file: No PDF header found");
  }

  // Strategy: Convert to images first, then create a new encrypted PDF with those images using pdfkit.
  // This is a robust way to ensure encryption without relying on failing native modules.
  // Note: Text selection is lost, but protection is guaranteed.

  const imagePaths = await pdfToImage(filePath);

  return new Promise((resolve, reject) => {
    try {
      const PDFDocumentGenerator = require("pdfkit"); // Renamed to avoid conflict

      const doc = new PDFDocumentGenerator({
        autoFirstPage: false,
        userPassword: password,
        ownerPassword: password,
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: false,
          documentAssembly: false,
        },
      });

      const outputPath = path.join(
        __dirname,
        "../outputs",
        `protected-${Date.now()}.pdf`,
      );

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      for (const imgPath of imagePaths) {
        const img = doc.openImage(imgPath);
        doc.addPage({ size: [img.width, img.height] });
        doc.image(imgPath, 0, 0);
      }

      doc.end();

      writeStream.on("finish", async () => {
        // Cleanup images
        for (const imgPath of imagePaths) {
          await fs
            .remove(imgPath)
            .catch((e) => console.error("Cleanup error:", e));
        }
        resolve(outputPath);
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

// PDF to Image
// PDF to Image
// PDF to Image
async function pdfToImage(filePath) {
  try {
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Read PDF as Base64 to avoid local file permission/path issues in some contexts
    // and easily inject into the page.
    const pdfBytes = await fs.readFile(filePath);
    const pdfData = pdfBytes.toString("base64");

    // Using unpkg CDN with a specific version known to work
    const pdfJsUrl = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
    const pdfWorkerUrl =
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const outputPaths = [];

    for (let i = 1; i <= pageCount; i++) {
      const outputPath = path.join(
        __dirname,
        "../outputs",
        `page-${i}-${Date.now()}.png`,
      );

      // Navigate to blank page
      await page.goto("about:blank");

      // Inject logic
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>body { margin: 0; padding: 0; overflow: hidden; }</style>
          <script src="${pdfJsUrl}"></script>
        </head>
        <body>
          <canvas id="the-canvas"></canvas>
          <script>
            // Set worker
            if (window.pdfjsLib) {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = '${pdfWorkerUrl}';
            }
            
            async function renderPage() {
              try {
                if (!window.pdfjsLib) return { error: "PDF.js not loaded" };
                
                const pdfData = atob("${pdfData}");
                const loadingTask = pdfjsLib.getDocument({data: pdfData});
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(${i});
                
                const scale = 2;
                const viewport = page.getViewport({scale: scale});
                const canvas = document.getElementById('the-canvas');
                const context = canvas.getContext('2d');
                
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({
                  canvasContext: context,
                  viewport: viewport
                }).promise;
                
                return { success: true };
              } catch (e) {
                return { error: e.toString() };
              }
            }
          </script>
        </body>
        </html>
      `);

      // Wait for pdfjsLib to be available just in case, though script tag is blocking usually.
      // But for robust CDNs, we might need a small wait.
      await page.waitForFunction(() => window.pdfjsLib !== undefined, {
        timeout: 30000,
      });

      // Trigger render
      const result = await page.evaluate(async () => {
        return await window.renderPage();
      });

      if (!result || result.error) {
        throw new Error(
          "Render failed: " + (result ? result.error : "Unknown error"),
        );
      }

      const element = await page.$("#the-canvas");
      if (element) {
        await element.screenshot({ path: outputPath });
        outputPaths.push(outputPath);
      } else {
        throw new Error("Canvas element not found after render");
      }
    }

    await browser.close();
    return outputPaths;
  } catch (error) {
    throw new Error(`PDF to Image conversion failed: ${error.message}`);
  }
}

// PDF to Word
async function pdfToWord(filePath) {
  try {
    const { createWorker } = require("tesseract.js");
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const dataBuffer = await fs.readFile(filePath);
    const data = new Uint8Array(dataBuffer);

    let extractedText = "";

    try {
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const tokenizedText = await page.getTextContent();
        const pageText = tokenizedText.items
          .map((token) => token.str)
          .join(" ");
        extractedText += pageText + "\n";
      }
    } catch (e) {
      console.error("PDF.js text extraction failed, fallback to OCR:", e);
    }

    // If no text was extracted, try OCR
    if (!extractedText || extractedText.trim().length === 0) {
      console.log("No text extracted, attempting OCR...");
      const imagePaths = await pdfToImage(filePath);

      const worker = await createWorker("eng");

      for (const imgPath of imagePaths) {
        const {
          data: { text },
        } = await worker.recognize(imgPath);
        extractedText += text + "\n\n";
        // Clean up image file
        await fs.remove(imgPath);
      }

      await worker.terminate();
    }

    const dataObj = {
      text: extractedText || "No text extracted even with OCR",
    };

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: dataObj.text.split("\n").map(
            (line) =>
              new Paragraph({
                children: [new TextRun(line)],
              }),
          ),
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = path.join(
      __dirname,
      "../outputs",
      `converted-${Date.now()}.docx`,
    );
    await fs.writeFile(outputPath, buffer);

    return outputPath;
  } catch (error) {
    throw new Error(`PDF to Word conversion failed: ${error.message}`);
  }
}

// PDF to Excel
async function pdfToExcel(filePath) {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const dataBuffer = await fs.readFile(filePath);
    const data = new Uint8Array(dataBuffer);

    let extractedText = "";

    // Disable worker for node env
    // pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const tokenizedText = await page.getTextContent();
      const pageText = tokenizedText.items.map((token) => token.str).join(" ");
      extractedText += pageText + "\n";
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheet 1");

    // Split text by lines and add to excel
    const lines = extractedText.split("\n");
    lines.forEach((line) => worksheet.addRow([line]));

    const outputPath = path.join(
      __dirname,
      "../outputs",
      `converted-${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(outputPath);
    return outputPath;
  } catch (error) {
    throw new Error(`PDF to Excel conversion failed: ${error.message}`);
  }
}

module.exports = {
  mergePDFs,
  splitPDF,
  compressPDF,
  rotatePDF,
  protectPDF,
  pdfToImage,
  pdfToWord,
  pdfToExcel,
  assemblePDF,
  extractPageText,
  modifyPageContent,
  addBlankPage,
};

// Extract text with coordinates from a specific page
async function extractPageText(filePath, pageIndex) {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Disable worker for Node environment to avoid errors
    // Some versions need this, some don't. Safe to try/catch or skip if legacy build handles it.

    const dataBuffer = await fs.readFile(filePath);
    const data = new Uint8Array(dataBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data,
      fontExtraProperties: true,
      disableFontFace: true
    });

    const pdfDocument = await loadingTask.promise;

    if (pageIndex < 0 || pageIndex >= pdfDocument.numPages) {
      throw new Error("Page index out of bounds");
    }

    const page = await pdfDocument.getPage(pageIndex + 1); // pdfjs is 1-based
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    // Process Text Items
    const items = textContent.items.map(item => {
      // transform is [scaleX, skewY, skewX, scaleY, tx, ty]
      // PDF coordinates start from bottom-left. We need to convert to top-left for web.

      const tx = item.transform[4];
      const ty = item.transform[5];

      // Calculate width/height approximately if not provided
      // item.width is usually available

      // Convert pdf y (bottom-up) to viewport y (top-down)
      // The y coordinate in transform is usually the baseline.
      // We need to adjust.

      // Detailed geometry math for PDF is complex. 
      // We'll return the raw PDF coords and the viewport dimensions so frontend can project them.
      // Or we try to normalize here.

      // Let's try to give easy web-coords (top-left based)
      // x is tx.
      // y is (viewport.height - ty). Note: this puts the point at the baseline.
      // We might want the top-left of the box. item.height is font height.

      // Use Math.abs(item.transform[3]) as the most reliable font size (scaleY)
      const fontSize = Math.abs(item.transform[3]);

      return {
        str: item.str,
        x: tx,
        y: viewport.height - ty, // Converted to top-down approx (baseline)
        originalY: ty,
        width: item.width,
        height: fontSize, // Use font size as height for better block logic
        fontName: item.fontName,
        transform: item.transform,
        hasEOL: item.hasEOL,
        isSpace: item.str.trim().length === 0
      };
    });

    return {
      width: viewport.width,
      height: viewport.height,
      items: items
    };

  } catch (error) {
    throw new Error(`Text extraction failed: ${error.message}`);
  }
}

// Modify Page Content (Redact old, Write new)
async function modifyPageContent(filePath, pageIndex, modifications) {
  // modifications: Array of { 
  //   type: 'text', 
  //   text: string, 
  //   x: number, 
  //   y: number, 
  //   size: number, 
  //   originalX: number, 
  //   originalY: number, 
  //   originalWidth: number, 
  //   originalHeight: number 
  // }
  // coordinates assumed to be PDF points (bottom-left origin) or we need to handle conversion

  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  const { height } = page.getSize();

  const { rgb, StandardFonts } = require("pdf-lib");
  const fonts = {
    serif: {
      regular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
    },
    sans: {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    }
  };

  for (const mod of modifications) {
    if (mod.type === 'replace') {
      // 1. Calculate Coordinates using CropBox (Robust)
      // Frontend sends mod.x / mod.y which are Viewport Top-Down coordinates.
      // mod.y for 'replace' items comes from extractPageText: viewport.height - ty.
      // So mod.y represents the BASELINE from the top of the viewport.

      const mediaBox = page.getMediaBox();
      const cropBox = page.getCropBox() || mediaBox;

      // Convert Viewport Baseline Y to PDF Baseline Y
      // PDF Y = (CropBox Top) - Viewport Y
      // because Viewport Y is distance from Top.
      const pdfBaselineY = (cropBox.y + cropBox.height) - mod.y;

      // PDF X = CropBox Left + Viewport X
      const pdfX = cropBox.x + mod.x;

      const deleteW = mod.originalWidth || (mod.text.length * mod.size * 0.5);
      // Heuristic sizes for redaction
      const fontSize = mod.size;

      // 2. Draw Redaction Box (Aggressive Coverage)
      // We start below the baseline to cover descenders, and go high enough to cover ascenders.
      // Standard Box: descent ~0.3em, ascent ~0.8-1.0em.
      // We'll use 0.5em descent and 1.2em ascent for safety.

      const boxBottom = pdfBaselineY - (fontSize * 0.5);
      const boxHeight = fontSize * 2.0; // 0.5 down + 1.5 up = Total 2.0 coverage

      const boxLeft = pdfX - 2; // Small left padding
      const boxWidth = deleteW + 5; // Slight padding

      // Draw White Box (Redaction)
      page.drawRectangle({
        x: boxLeft,
        y: boxBottom,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
      });

      // 3. Draw New Text
      const fontSet = mod.isSerif ? fonts.serif : fonts.sans;
      let selectedFont = fontSet.regular;
      if (mod.isBold && mod.isItalic) selectedFont = fontSet.boldItalic;
      else if (mod.isBold) selectedFont = fontSet.bold;
      else if (mod.isItalic) selectedFont = fontSet.italic;

      // Calculate remaining width to prevent clipping
      const pageWidth = page.getSize().width;
      const remainingWidth = Math.max(pageWidth - pdfX - 20, 50);
      const wrapWidth = Math.min(deleteW + 10, remainingWidth);

      page.drawText(mod.text, {
        x: pdfX,
        y: pdfBaselineY,
        size: fontSize,
        font: selectedFont,
        color: rgb(0, 0, 0),
        maxWidth: wrapWidth,
        lineHeight: fontSize * 1.15,
      });
    } else if (mod.type === 'add') {
      // Add text (mod.y from frontend is PDF points from Top-Left)
      // ...
      const mediaBox = page.getMediaBox();
      const cropBox = page.getCropBox() || mediaBox;
      const pdfBaselineY = (cropBox.y + cropBox.height) - mod.y;
      const pdfX = cropBox.x + mod.x;

      let color = rgb(0, 0, 0);
      if (mod.color) {
        const r = parseInt(mod.color.slice(1, 3), 16) / 255;
        const g = parseInt(mod.color.slice(3, 5), 16) / 255;
        const b = parseInt(mod.color.slice(5, 7), 16) / 255;
        color = rgb(r, g, b);
      }

      // Draw background if requested
      if (mod.backgroundColor && mod.backgroundColor !== 'transparent') {
        const bgCol = rgb(1, 1, 1);
        const bgWidth = mod.boxWidth || (mod.text.length * mod.size * 0.6);
        const bgHeight = mod.boxHeight || (mod.size * 1.4);
        // Position rectangle relative to baseline
        const rectBottom = pdfBaselineY - (mod.size * 0.3);

        page.drawRectangle({
          x: pdfX,
          y: rectBottom,
          width: bgWidth,
          height: bgHeight,
          color: bgCol
        });
      }

      const fontSet = mod.isSerif ? fonts.serif : fonts.sans;
      let selectedFont = fontSet.regular;
      if (mod.isBold && mod.isItalic) selectedFont = fontSet.boldItalic;
      else if (mod.isBold) selectedFont = fontSet.bold;
      else if (mod.isItalic) selectedFont = fontSet.italic;

      // Ensure we don't wrap too aggressively and respect page boundaries
      const pageWidth = page.getSize().width;
      const remainingWidth = Math.max(pageWidth - pdfX - 40, 50);
      const drawMaxWidth = mod.boxWidth ? Math.min(mod.boxWidth + 10, remainingWidth) : remainingWidth;

      page.drawText(mod.text.trim().replace(/\s+/g, ' '), { // Normalize spaces
        x: pdfX,
        y: pdfBaselineY,
        size: mod.size,
        font: selectedFont,
        color: color,
        maxWidth: drawMaxWidth,
        lineHeight: mod.size * 1.15,
      });
    }
  }

  const newBytes = await pdfDoc.save();
  const outputPath = path.join(
    __dirname,
    "../outputs",
    `content-edited-${Date.now()}.pdf`
  );
  await fs.writeFile(outputPath, newBytes);

  return outputPath;
}
// Add Blank Page
async function addBlankPage(filePath) {
  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Add a blank page. Default size is usually A4 (595.28 x 841.89) or matches document.
  // Let's match the first page size if possible
  const firstPage = pdfDoc.getPages()[0];
  const { width, height } = firstPage ? firstPage.getSize() : { width: 595.28, height: 841.89 };

  const newPage = pdfDoc.addPage([width, height]);

  const newPdfBytes = await pdfDoc.save();
  const outputPath = path.join(
    __dirname,
    "../outputs",
    `added-page-${Date.now()}.pdf`
  );
  await fs.writeFile(outputPath, newPdfBytes);

  return outputPath;
}

// Assemble PDF (Reorder/Rotate/Delete)
async function assemblePDF(filePath, pageSpecs) {
  // pageSpecs: Array of { index: number, rotation: number }
  // index is 0-based index of page in original document
  // rotation is degrees to ADD to current rotation (e.g. 90, 180, -90)

  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  const newPdf = await PDFDocument.create();

  // Validate specs
  const validSpecs = pageSpecs.filter(
    (spec) => spec.index >= 0 && spec.index < totalPages
  );

  if (validSpecs.length === 0) {
    throw new Error('No valid pages selected for the new PDF');
  }

  // We need to copy pages. Note: copyPages takes an array of indices.
  // Ideally we pass all indices at once for performance, but if we need specific order matching the specs,
  // we might need to be careful. validSpecs IS the order.

  const indicesToCopy = validSpecs.map((spec) => spec.index);

  // copyPages returns pages in the order of indices provided.
  const copiedPages = await newPdf.copyPages(pdfDoc, indicesToCopy);

  for (let i = 0; i < validSpecs.length; i++) {
    const spec = validSpecs[i];
    const page = copiedPages[i];

    // Apply rotation
    if (spec.rotation) {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + spec.rotation));
    }

    newPdf.addPage(page);
  }

  const newPdfBytes = await newPdf.save();
  const outputPath = path.join(
    __dirname,
    "../outputs",
    `edited-${Date.now()}.pdf`
  );
  await fs.writeFile(outputPath, newPdfBytes);

  return outputPath;
}
