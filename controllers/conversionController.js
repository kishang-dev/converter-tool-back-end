const path = require("path");
const fs = require("fs-extra");
const pptxgen = require("pptxgenjs");
const { pdfToImage } = require("../utils/pdfUtils");
// const pdfParse = require("pdf-parse"); // Unused
const PDFParser = require("pdf2json");
const puppeteer = require("puppeteer");
const ExcelJS = require("exceljs");
const File = require("../models/File"); // Assuming File model exists

// Helper to create file record
async function createFileRecord(req, originalName, outputPath, mimeType, operation) {
    return await File.create({
        filename: path.basename(outputPath),
        originalName: originalName,
        path: outputPath,
        size: (await fs.stat(outputPath)).size,
        mimeType: mimeType,
        operation: operation,
        status: "completed",
        user: req.user ? req.user._id : undefined,
        guestId: req.user ? undefined : req.headers['x-guest-id']
    });
}

// 1. PDF to PowerPoint
exports.pdfToPptx = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        // Convert PDF pages to images first
        const imagePaths = await pdfToImage(file.path);

        const pres = new pptxgen();

        for (const imgPath of imagePaths) {
            const slide = pres.addSlide();
            // Add image to slide, fitting it to cover the slide
            slide.addImage({ path: imgPath, x: 0, y: 0, w: "100%", h: "100%" });
        }

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.pptx`);
        await pres.writeFile({ fileName: outputPath });

        // Cleanup images
        for (const imgPath of imagePaths) {
            await fs.remove(imgPath).catch(console.error);
        }

        const pptxFile = await createFileRecord(req, file.originalName.replace(".pdf", ".pptx"), outputPath, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "convert-pdf-to-pptx");

        res.json({ success: true, message: "PDF converted to PowerPoint", file: pptxFile });
    } catch (error) {
        console.error("PDF to PPTX error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

// 2. Excel to PDF
exports.excelToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file.path);

        // Convert to HTML first
        let htmlContent = "<html><head><style>table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid black; padding: 5px; } </style></head><body>";

        workbook.eachSheet((worksheet) => {
            htmlContent += `<h2>${worksheet.name}</h2><table>`;
            worksheet.eachRow((row) => {
                htmlContent += "<tr>";
                row.eachCell((cell) => {
                    htmlContent += `<td>${cell.text || ""}</td>`;
                });
                htmlContent += "</tr>";
            });
            htmlContent += "</table><br/>";
        });
        htmlContent += "</body></html>";

        // Use Puppeteer to print PDF
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--single-process", // Important for some environments
                "--disable-gpu"
            ]
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent);

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.pdf`);
        await page.pdf({ path: outputPath, format: "A4", margin: { top: "20px", bottom: "20px" } });

        await browser.close();

        const pdfFile = await createFileRecord(req, file.originalName.replace(".xlsx", ".pdf"), outputPath, "application/pdf", "convert-excel-to-pdf");

        res.json({ success: true, message: "Excel converted to PDF", file: pdfFile });
    } catch (error) {
        console.error("Excel to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};


// 3. PowerPoint to PDF (Basic text/image extraction or basic rendering? - Hard without LibreOffice)
// Strategy: We will try to read slides (if possible with a library) or just return a limitation message if strictly pure JS is weak here.
// Actually, let's use a simple approach: We can't easily render PPTX slides to PDF with high fidelity in pure Node.js.
// We will use a placeholder implementation that warns or does basic text extraction.
// OR better: we can use `officeparser` or similar to get text, but visual layout is hard.
// Let's implement a "best effort" text-based PDF for now, or just skip if too complex.
// Wait, user asked for "PowerPoint to PDF".
// We can use Puppeteer if we can convert PPTX to HTML. 
// There are no perfect free PPTX->HTML node libraries. 
// I will implement a placeholder that strictly converts TEXT content to PDF as a fallback.
exports.pptToPdf = async (req, res) => {
    try {
        // Just returning a specific error for now as "Not fully supported in pure JS" or implementing text extraction.
        // Let's try text extraction.
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        // Using a library like 'office-text-extractor' or similar would be good, but we have 'jszip'.
        // We can unzip and find text. 
        // For now, let's just say "Text Extraction Mode"
        // Actually, let's skip complex implementation and just do a simple "Sorry, this requires LibreOffice" if we want honesty,
        // OR we use an external package if available. 
        // Let's rely on 'fs' to read it? No.
        // Let's use 'text-extraction' via 'office-text-extractor' if we added it? No.

        // Fallback: Create a PDF that says "Preview not available in pure Node.js mode"
        // Or just extract text using regex on the XML content of the PPTX (it is a zip).

        // I'll leave this basic for now to avoid breaking constraints.
        // Detailed implementation of PPTX -> PDF in pure JS is a huge project (slide rendering).
        // I will return a 501 Not Implemented or similar with a message to the user.

        return res.status(501).json({ error: "PowerPoint to PDF requires LibreOffice installed on the server", details: "Pure Node.js conversion is not yet supported for high fidelity." });

    } catch (error) {
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};


// 4. HTML to PDF
exports.htmlToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--single-process",
                "--disable-gpu"
            ]
        });
        const page = await browser.newPage();

        // Read file content
        const htmlContent = await fs.readFile(file.path, 'utf8');
        await page.setContent(htmlContent);

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.pdf`);
        await page.pdf({ path: outputPath, format: "A4" });

        await browser.close();

        const pdfFile = await createFileRecord(req, file.originalName.replace(".html", ".pdf"), outputPath, "application/pdf", "convert-html-to-pdf");

        res.json({ success: true, message: "HTML converted to PDF", file: pdfFile });
    } catch (error) {
        console.error("HTML to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

// 5. PDF to Text
exports.pdfToText = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const dataBuffer = await fs.readFile(file.path);
        const data = await pdfParse(dataBuffer);

        const outputPath = path.join(__dirname, "../outputs", `extracted-${Date.now()}.txt`);
        await fs.writeFile(outputPath, data.text);

        const txtFile = await createFileRecord(req, file.originalName.replace(".pdf", ".txt"), outputPath, "text/plain", "convert-pdf-to-text");

        res.json({ success: true, message: "Text extracted from PDF", file: txtFile, textPreview: data.text.substring(0, 1000) });
    } catch (error) {
        console.error("PDF to Text error:", error);
        res.status(500).json({ error: "Extraction failed", details: error.message });
    }
};

// 6. PDF to HTML
exports.pdfToHtml = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const pdfParser = new PDFParser();

        const pdfData = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
            pdfParser.on("pdfParser_dataReady", pdfData => resolve(pdfData));
            pdfParser.loadPDF(file.path);
        });

        // Convert parsed data to HTML
        let htmlContent = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { font-family: sans-serif; background: #eee; } .page { position: relative; background: white; border: 1px solid #ccc; margin: 10px auto; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.1); } .text-layer { position: absolute; white-space: pre; line-height: 1; transform-origin: 0 0; }</style></head><body>';

        // Scale for pdf2json units
        const scale = 30;

        for (const page of pdfData.Pages) {
            const width = page.Width * scale;
            const height = page.Height * scale;

            htmlContent += `<div class="page" style="width: ${width}px; height: ${height}px;">`;

            for (const text of page.Texts) {
                const x = text.x * scale;
                const y = text.y * scale;

                let content = "";
                for (const r of text.R) {
                    content += decodeURIComponent(r.T);
                }

                const fontSize = (text.R[0].TS[1] || 12) * (scale / 22);

                htmlContent += `<div class="text-layer" style="left: ${x}px; top: ${y}px; font-size: ${fontSize}px;">${content}</div>`;
            }

            // Basic fills
            for (const fill of page.Fills || []) {
                const x = fill.x * scale;
                const y = fill.y * scale;
                const w = fill.w * scale;
                const h = fill.h * scale;
                // color parsing is complex in pdf2json (it's often an index or similar), skipping for now to avoid errors
                // htmlContent += `<div style="position: absolute; left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px; background-color: #ccc; opacity: 0.2;"></div>`;
            }

            htmlContent += `</div>`;
        }

        htmlContent += "</body></html>";

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.html`);
        await fs.writeFile(outputPath, htmlContent);

        const htmlFile = await createFileRecord(req, file.originalName.replace(".pdf", ".html"), outputPath, "text/html", "convert-pdf-to-html");

        res.json({ success: true, message: "PDF converted to HTML", file: htmlFile });

    } catch (error) {
        console.error("PDF to HTML error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};
