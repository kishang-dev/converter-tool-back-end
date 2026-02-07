const path = require("path");
const fs = require("fs-extra");
const pptxgen = require("pptxgenjs");
const { pdfToImage } = require("../utils/pdfUtils");
const pdfParse = require("pdf-parse");
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
    } catch(error) {
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
         // We can use pdf2htmlEX if installed, but pure JS:
         // Use pdf-parse to get text structure? No, that's just text.
         // Use `pdfjs-dist` to render SVG?
         // Existing `pdfToImage` converts to images. We could wrap images in HTML.
         // Or we use a library `pdf2json` and build HTML.
         // Simple approach: Convert to Images and stack them in an HTML file. This preserves layout perfectly.
         
         const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const imagePaths = await pdfToImage(file.path);
        
        let htmlContent = "<html><body style='background-color: gray; text-align: center;'>";
        for (const imgPath of imagePaths) {
            // We need to serve these images. 
            // In a real app we'd upload them to cloud or static serve.
            // Here we can embed as base64 for a single file download.
            const imgBuffer = await fs.readFile(imgPath);
            const base64 = imgBuffer.toString('base64');
            htmlContent += `<img src="data:image/png;base64,${base64}" style="max-width: 100%; margin-bottom: 20px; box-shadow: 0 0 10px black;" /><br/>`;
        }
        htmlContent += "</body></html>";
        
        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.html`);
        await fs.writeFile(outputPath, htmlContent);

         // Cleanup images
        for (const imgPath of imagePaths) {
            await fs.remove(imgPath).catch(console.error);
        }

        const htmlFile = await createFileRecord(req, file.originalName.replace(".pdf", ".html"), outputPath, "text/html", "convert-pdf-to-html");

         res.json({ success: true, message: "PDF converted to HTML", file: htmlFile });

     } catch(error) {
         console.error("PDF to HTML error:", error);
         res.status(500).json({ error: "Conversion failed", details: error.message });
     }
};
