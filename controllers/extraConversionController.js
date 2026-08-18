const path = require("path");
const fs = require("fs-extra");
const puppeteer = require("puppeteer");
const mammoth = require("mammoth");
const sharp = require("sharp");
const PDFParser = require("pdf2json");
const PDFDocument = require("pdfkit");
const googleTTS = require("google-tts-api");
const File = require("../models/File");
const JSZip = require("jszip");

let cachedTranscriber = null;

const resolveFilePath = (filePath) => path.isAbsolute(filePath) ? filePath : path.join(__dirname, "..", filePath);

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

const { getBrowser } = require("../utils/browserUtils");

exports.wordToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        let finalHtml = "";
        let extractedImages = [];

        try {
            // Priority 1: Mammoth (The expert engine for .docx formatting/tables)
            const { value: parsedHtml } = await mammoth.convertToHtml({ path: safePath });
            if (parsedHtml && parsedHtml.length > 50) {
                finalHtml = parsedHtml;
            } else {
                throw new Error("Mammoth result too small");
            }
        } catch (mammothErr) {
            console.warn("Mammoth failed or legacy .doc detected. Launching Advanced Offline Scraper...");
            const data = await fs.readFile(safePath);

            // Aggressive String Processing (Same as PPT/Legacy logic)
            let rawText = "";
            try {
                const officeParser = require('officeparser');
                rawText = await officeParser.parseOfficeAsync(safePath);
            } catch (offErr) {
                // Byte-level recovery if officeparser fails
                let utf16Str = "";
                for (let i = 0; i < data.length - 1; i++) {
                    if (data[i] >= 32 && data[i] <= 126 && data[i + 1] === 0) {
                        utf16Str += String.fromCharCode(data[i]);
                        i++;
                    } else if (!utf16Str.endsWith("\n")) utf16Str += "\n";
                }
                rawText = utf16Str;
            }

            const junkLabels = [
                "Root Entry", "CompObj", "Current User", "PowerPoint Document", "SummaryInformation", "DocumentSummaryInformation",
                "Times New Roman", "Arial", "Calibri", "Courier New", "Cambria", "Droid Sans", "WenQuanYi", "DejaVu", "Segoe", "Microsoft",
                "schemas.openxmlformats", "xml", "PowerPoint", "style.visibility", "visible", "Click to edit", "Outline Level", "Master Slide",
                "Heading 1", "Heading 2", "Heading 3", "Internet Link", "Visited Internet Link", "Text Body", "Caption", "Normal", "Table Contents",
                "Bullets", "Heading", "Index", "Quotations", "Title", "Subtitle", "Symbol", "Liberation Serif", "Open Sans", "FreeSans", "OpenSymbol", "Liberation Sans"
            ];

            const cleanLines = rawText.split("\n")
                .map(l => l.trim())
                .filter(l => {
                    const isJunk = junkLabels.some(j => l.includes(j));
                    // Stricter filtering for single-word layout headers
                    const isLayoutHeader = (l.length < 15 && junkLabels.some(j => l === j));
                    const isShort = l.length < 5;
                    const isCode = l.includes(";") || l.includes("{") || l.includes(":") || l.includes("==") || l.includes("/>");
                    const hasWords = /[a-zA-Z]{4,}/.test(l);
                    return !isJunk && !isShort && !isCode && hasWords && !isLayoutHeader;
                })
                .filter((l, i, self) => self.indexOf(l) === i); // Deduplicate

            finalHtml = cleanLines.map(line => `<p style="margin-bottom: 12px; line-height: 1.6; color: #333;">${line}</p>`).join("");

            // ===================================
            // THE IMAGE SCRAPER (Legacy .doc)
            // ===================================
            let i = 0;
            while (i < data.length - 2) {
                if (data[i] === 0xFF && data[i + 1] === 0xD8 && data[i + 2] === 0xFF) { // JPEG
                    const s = i; let e = -1;
                    for (let j = s; j < data.length - 1; j++) { if (data[j] === 0xFF && data[j + 1] === 0xD9) { e = j + 2; break; } }
                    if (e !== -1) {
                        const buf = data.subarray(s, e);
                        if (buf.length > 8000) extractedImages.push(buf);
                        i = e; continue;
                    }
                } else if (data[i] === 0x89 && data[i + 1] === 0x50 && data[i + 2] === 0x4E && data[i + 3] === 0x47) { // PNG
                    const s = i; let e = -1;
                    for (let j = s; j < data.length - 7; j++) { if (data[j] === 0x49 && data[j + 1] === 0x45 && data[j + 2] === 0x4E && data[j + 3] === 0x44) { e = j + 8; break; } }
                    if (e !== -1) {
                        const buf = data.subarray(s, e);
                        if (buf.length > 8000) extractedImages.push(buf);
                        i = e; continue;
                    }
                }
                i++;
            }
        }

        // Add extracted images to the HTML if we found any in legacy mode
        if (extractedImages.length > 0) {
            finalHtml += "<div style='page-break-before: always; text-align: center;'>";
            finalHtml += "<h2 style='text-align: center; color: #444; margin-top: 40px;'>Recovered Document Visuals</h2>";
            for (const img of extractedImages) {
                try {
                    // EXPERT FIX: Use sharp to normalize the raw byte rip into a standard, browser-friendly JPEG.
                    // This fixes the "Black Box" issue by ensuring the binary stream is a valid image buffer.
                    const sharp = require('sharp');
                    const normalizedBuffer = await sharp(img).jpeg({ quality: 90 }).toBuffer();
                    const base64 = normalizedBuffer.toString('base64');
                    finalHtml += `<img src="data:image/jpeg;base64,${base64}" style="max-width: 90%; margin: 20px auto; border: 1px solid #ddd; display: block; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-radius: 12px;" />`;
                } catch (imgErr) {
                    console.warn("Skipping malformed image strip during Word recovery:", imgErr.message);
                }
            }
            finalHtml += "</div>";
        }

        const browser = await getBrowser();
        const page = await browser.newPage();

        // Premium CSS Layout for the PDF
        await page.setContent(`
            <html>
            <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap');
                    body { font-family: 'Outfit', sans-serif; color: #1a1a1a; padding: 40px; background: #fff; }
                    h1 { color: #2d3436; text-align: center; font-weight: 600; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                    p { font-size: 15px; margin: 10px 0; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e1e1e1; }
                    th, td { border: 1px solid #e1e1e1; padding: 12px; text-align: left; }
                    th { background-color: #f9f9f9; font-weight: 600; }
                    img { border-radius: 8px; display: block; margin: 0 auto; }
                </style>
            </head>
            <body>
                <h1>Document Processed Successfully</h1>
                <div id="content">${finalHtml}</div>
            </body>
            </html>
        `);

        // CRITICAL FIX: Explicitly wait for ALL images to finish their internal base64 rendering 
        // before triggering the PDF printer. This prevents blank pages for images.
        await page.evaluate(async () => {
            const selectors = Array.from(document.querySelectorAll('img'));
            await Promise.all(selectors.map(img => {
                if (img.complete) return;
                return new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            }));
        });

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.pdf`);
        await page.pdf({
            path: outputPath,
            format: "A4",
            printBackground: true,
            margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' }
        });
        await browser.close();

        const pdfFile = await createFileRecord(req, file.originalName.replace(".docx", ".pdf").replace(".doc", ".pdf"), outputPath, "application/pdf", "convert-word-to-pdf");
        res.json({ success: true, message: "Word converted to PDF professionally with visuals", file: pdfFile });
    } catch (error) {
        console.error("Word to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.pptToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        const data = await fs.readFile(safePath);

        let extractedText = "";
        const extractedImages = [];

        try {
            const officeParser = require('officeparser');
            let parsedText = await officeParser.parseOfficeAsync(safePath);
            if (parsedText) {
                // Aggressive blacklist for technical metadata, font names, and CSS properties
                const junkPatterns = [
                    "Root Entry", "CompObj", "Current User", "PowerPoint Document", "SummaryInformation", "DocumentSummaryInformation",
                    "Times New Roman", "Arial", "Calibri", "Courier New", "Cambria", "Droid Sans", "WenQuanYi", "DejaVu", "Segoe", "Microsoft",
                    "schemas.openxmlformats", "xml", "PowerPoint", "style.visibility", "visible", "Click to edit", "Outline Level", "Master Slide"
                ];

                extractedText = parsedText.split("\n")
                    .map(line => line.trim())
                    .filter(line => {
                        const low = line.toLowerCase();
                        // Filter out technical strings, font names, and tiny junk
                        const isJunk = junkPatterns.some(p => line.includes(p));
                        const isNumericJunk = /^[\d\s\W]+$/.test(line); // Just numbers and symbols
                        const isVeryShort = line.length < 3;
                        const isCodeLike = line.includes(";") || line.includes("{") || line.includes(":");
                        return !isJunk && !isNumericJunk && !isVeryShort && !isCodeLike;
                    })
                    .join("\n\n");
            } else {
                throw new Error("OfficeParser failed");
            }
        } catch (parserError) {
            // Custom UTF-16LE String Extractor (No extra metadata/ASCII noise)
            let utf16String = "";
            for (let i = 0; i < data.length - 1; i++) {
                if (data[i] >= 32 && data[i] <= 126 && data[i + 1] === 0) {
                    utf16String += String.fromCharCode(data[i]);
                    i++;
                } else {
                    if (!utf16String.endsWith("\n")) utf16String += "\n";
                }
            }

            const junkPatterns = [
                "Root Entry", "CompObj", "Current User", "PowerPoint Document", "SummaryInformation", "DocumentSummaryInformation",
                "Times New Roman", "Arial", "Calibri", "Courier New", "Cambria", "Droid Sans", "WenQuanYi", "DejaVu", "Segoe", "Microsoft",
                "schemas.openxmlformats", "xml", "PowerPoint", "style.visibility", "visible", "Click to edit", "Outline Level", "Master Slide"
            ];

            extractedText = utf16String.split("\n")
                .map(line => line.trim())
                .filter(line => {
                    const low = line.toLowerCase();
                    const isJunk = junkPatterns.some(p => line.includes(p));
                    const isNumericJunk = /^[\d\s\W]+$/.test(line);
                    const isVeryShort = line.length < 4;
                    const isCodeLike = line.includes(";") || line.includes("{") || line.includes(":");
                    // Require at least 4 letters to be considered actual word content
                    const hasWords = /[a-zA-Z]{4,}/.test(line);
                    return !isJunk && !isNumericJunk && !isVeryShort && !isCodeLike && hasWords;
                })
                .join("\n\n");
        }

        // =========================================================================
        // PURE JAVASCRIPT IMAGE SCRAPER (Extracts embedded graphics from any binary)
        // =========================================================================
        let i = 0;
        while (i < data.length - 2) {
            // Find JPEG Start of Image (FF D8 FF)
            if (data[i] === 0xFF && data[i + 1] === 0xD8 && data[i + 2] === 0xFF) {
                const startIdx = i;
                let endIdx = -1;
                // Search for JPEG End of Image (FF D9)
                for (let j = startIdx; j < data.length - 1; j++) {
                    if (data[j] === 0xFF && data[j + 1] === 0xD9) {
                        endIdx = j + 2;
                        break;
                    }
                }
                if (endIdx !== -1) {
                    const imgBuffer = data.subarray(startIdx, endIdx);
                    // Only accept images reasonably sized (prevent tiny thumbnail noise > 5KB)
                    if (imgBuffer.length > 5000) extractedImages.push(imgBuffer);
                    i = endIdx;
                    continue;
                }
            }
            // Find PNG Magic Number (89 50 4E 47 0D 0A 1A 0A)
            else if (data[i] === 0x89 && data[i + 1] === 0x50 && data[i + 2] === 0x4E && data[i + 3] === 0x47) {
                const startIdx = i;
                let endIdx = -1;
                // Search for PNG EOF (49 45 4E 44 AE 42 60 82 -> IEND chunk)
                for (let j = startIdx; j < data.length - 7; j++) {
                    if (data[j] === 0x49 && data[j + 1] === 0x45 && data[j + 2] === 0x4E && data[j + 3] === 0x44) {
                        endIdx = j + 8; // Include IEND and CRC
                        break;
                    }
                }
                if (endIdx !== -1) {
                    const imgBuffer = data.subarray(startIdx, endIdx);
                    if (imgBuffer.length > 5000) extractedImages.push(imgBuffer);
                    i = endIdx;
                    continue;
                }
            }
            i++;
        }

        // Build Final Document Visually!
        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.pdf`);
        const doc = new PDFDocument({
            margin: 50,
            info: { Title: "Converted Presentation", Author: "Offline PDF Converter" }
        });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Render Clean Core Text Layout (Removing "Slide Click" placeholders and short labels)
        const finalCleanText = extractedText.split("\n\n")
            .filter(para => {
                const p = para.trim();
                if (!p) return false;
                // Exclude common slide placeholders and layout labels
                const labels = ["Chart", "Table", "Column 1", "Column 2", "Column 3", "Column 4", "Column 5", "Photo", "Picture", "Pictures", "Slide"];
                const isPlaceholder = p.includes("Click to edit") || p.includes("Outline Level");
                const isShortLabel = labels.some(l => p === l || p.startsWith(l + " "));
                return !isPlaceholder && !isShortLabel && p.length > 5;
            })
            // Remove exact duplicate blocks often found in PPT binaries
            .filter((para, index, self) => self.indexOf(para) === index)
            .join("\n\n");

        doc.fontSize(20).font("Helvetica-Bold").text("Presentation Contents", { align: "center" }).moveDown(1.5);

        if (!finalCleanText.trim()) {
            doc.fontSize(12).font("Helvetica").text("No standard speaker text found on slides.", { align: "center" });
        } else {
            doc.fontSize(11).font("Helvetica").fillColor('#333333').text(finalCleanText.substring(0, 15000), {
                align: "left",
                lineGap: 4
            });
        }

        // Natively Render Extracted Presentation Images!
        if (extractedImages.length > 0) {
            doc.addPage();
            doc.fontSize(18).font("Helvetica-Bold").text("Extracted Visual Slides", { align: "center" }).moveDown(2);

            for (const imgBuffer of extractedImages) {
                // Approximate a "Slide" Look with a border
                const currentY = doc.y;
                if (currentY > 500) doc.addPage(); // Avoid splitting image across pages

                try {
                    doc.image(imgBuffer, {
                        fit: [500, 350],
                        align: 'center',
                        valign: 'center'
                    });
                    doc.moveDown(2);
                    // Light separator line
                    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#eeeeee").stroke().moveDown(1);
                } catch (imgErr) {
                    // Skip malformed byte strips
                }
            }
        }

        doc.end();

        await new Promise((resolve) => stream.on("finish", resolve));

        const pdfFile = await createFileRecord(req, file.originalName.replace(".pptx", ".pdf").replace(".ppt", ".pdf"), outputPath, "application/pdf", "convert-ppt-to-pdf");
        res.json({ success: true, message: "PPT converted to PDF completely offline mapping images", file: pdfFile });
    } catch (error) {
        console.error("PPT to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.imageConvert = async (req, res) => {
    try {
        const { fileId, targetFormat } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        if (!["png", "jpg", "jpeg", "webp"].includes(targetFormat)) {
            return res.status(400).json({ error: "Invalid target format" });
        }

        const ext = targetFormat === "jpeg" ? "jpg" : targetFormat;
        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.${ext}`);

        const mimeMap = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "webp": "image/webp"
        };

        const safePath = resolveFilePath(file.path);

        if (file.mimeType === "image/svg+xml") {
            await sharp(safePath)
                .toFormat(targetFormat)
                .toFile(outputPath);
        } else {
            await sharp(safePath)
                .toFormat(targetFormat)
                .toFile(outputPath);
        }

        const originalBase = path.parse(file.originalName).name;
        const imgFile = await createFileRecord(req, `${originalBase}.${ext}`, outputPath, mimeMap[targetFormat], `convert-image-to-${ext}`);
        res.json({ success: true, message: `Image converted to ${ext.toUpperCase()}`, file: imgFile });
    } catch (error) {
        console.error("Image convert error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.textToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        const text = await fs.readFile(safePath, 'utf8');
        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.pdf`);

        const doc = new PDFDocument({ margin: 40 });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        doc.fontSize(12).font("Courier").text(text);
        doc.end();

        await new Promise((resolve) => stream.on("finish", resolve));

        const originalBase = path.parse(file.originalName).name;
        const pdfFile = await createFileRecord(req, `${originalBase}.pdf`, outputPath, "application/pdf", "convert-text-to-pdf");
        res.json({ success: true, message: "Text converted to PDF", file: pdfFile });
    } catch (error) {
        console.error("Text to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.csvToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        const text = await fs.readFile(safePath, 'utf8');
        const rows = text.split('\n').filter(r => r.trim());
        if (rows.length === 0) throw new Error("Empty CSV or invalid formatting");

        // SMART DETECTION: Count columns to decide on Landscape vs Portrait
        const colCount = rows[0].split(',').length;
        const useLandscape = colCount > 6;
        const fontSize = colCount > 12 ? '7px' : (colCount > 8 ? '9px' : '11px');

        let html = `
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
                body { font-family: 'Inter', sans-serif; font-size: ${fontSize}; margin: 0; padding: 20px; color: #333; }
                table { border-collapse: collapse; width: 100%; table-layout: fixed; border: 1px solid #e0e0e0; }
                th, td { 
                    border: 1px solid #e0e0e0; 
                    padding: 6px 4px; 
                    text-align: left; 
                    word-wrap: break-word; 
                    overflow-wrap: break-word; 
                    vertical-align: top;
                }
                th { background-color: #f8f9fa; font-weight: 600; color: #1a1a1a; text-transform: uppercase; letter-spacing: 0.02em; }
                tr:nth-child(even) { background-color: #fcfcfc; }
                h2 { text-align: center; color: #2d3436; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h2>Data Export: ${file.originalName}</h2>
            <table>`;

        rows.forEach((row, i) => {
            html += "<tr>";
            // Handle comma split correctly with basic quote support
            const cells = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',');
            cells.forEach(cell => {
                const cellText = cell.replace(/^"/, '').replace(/"$/, '').trim();
                if (i === 0) html += `<th>${cellText}</th>`;
                else html += `<td>${cellText}</td>`;
            });
            html += "</tr>";
        });
        html += "</table></body></html>";

        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.setContent(html);

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.pdf`);
        await page.pdf({
            path: outputPath,
            format: "A4",
            landscape: useLandscape,
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });
        await browser.close();

        const originalBase = path.basename(file.originalName, path.extname(file.originalName));
        const pdfFile = await createFileRecord(req, `${originalBase}.pdf`, outputPath, "application/pdf", "convert-csv-to-pdf");
        res.json({ success: true, message: "Large CSV converted to PDF layout professionally", file: pdfFile });
    } catch (error) {
        console.error("CSV to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.pdfToCsv = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        const pdfParser = new PDFParser(this, 1);
        const textContent = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
            pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
            pdfParser.loadPDF(safePath);
        });

        const lines = textContent.split('\r\n').filter(l => l.trim() !== '');
        const csvContent = lines.map(l => `"${l.replace(/"/g, '""')}"`).join('\n');

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.csv`);
        await fs.writeFile(outputPath, csvContent);

        const originalBase = path.parse(file.originalName).name;
        const csvFile = await createFileRecord(req, `${originalBase}.csv`, outputPath, "text/csv", "convert-pdf-to-csv");
        res.json({ success: true, message: "PDF extracted to CSV format", file: csvFile });
    } catch (error) {
        console.error("PDF to CSV error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.pdfToSpeech = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        const pdfParser = new PDFParser(this, 1);
        let textContent = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
            pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
            pdfParser.loadPDF(safePath);
        });

        // pdf2json might contain some page headers or line breaks. We clean it minimally.
        const shortText = textContent.replace(/\s+/g, ' ').substring(0, 5000);
        if (!shortText.trim()) return res.status(400).json({ error: "No text found in PDF" });

        const tsResult = await googleTTS.getAllAudioUrls(shortText, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com'
        });

        const https = require('https');
        const downloadAudio = (url) => new Promise((resolve, reject) => {
            https.get(url, (response) => {
                if (response.statusCode !== 200) return reject(new Error('Failed to fetch TTS segment'));
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
            }).on('error', reject);
        });

        const buffers = [];
        for (const item of tsResult) {
            try {
                const b = await downloadAudio(item.url);
                buffers.push(b);
            } catch (err) {
                console.error("Failed to download TTS segment:", err);
            }
        }

        if (buffers.length === 0) return res.status(500).json({ error: "Failed to generate speech audio streams from provider" });

        const finalBuffer = Buffer.concat(buffers);
        const outputPath = path.join(__dirname, "../outputs", `speech-${Date.now()}.mp3`);
        await fs.writeFile(outputPath, finalBuffer);

        const originalBase = path.parse(file.originalName).name;
        const mp3File = await createFileRecord(req, `${originalBase}_audio.mp3`, outputPath, "audio/mpeg", "convert-pdf-to-speech");

        res.json({ success: true, message: "Speech automatically mapped to MP3 file", file: mp3File });
    } catch (error) {
        console.error("PDF to Speech error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.videoToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        let transcribedChunks = [];

        try {
            console.log("🚀 Initializing Premium Offline AI Transcriber...");

            // Require static FFMPEG
            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('ffmpeg-static');
            ffmpeg.setFfmpegPath(ffmpegPath);

            // Generate clean 16kHz WAV buffer locally
            const tempWavPath = path.join(__dirname, "../outputs", `temp-${Date.now()}.wav`);
            await new Promise((resolve, reject) => {
                ffmpeg(safePath)
                    .noVideo()
                    .format('wav')
                    .audioFrequency(16000)
                    .audioChannels(1)
                    .on('end', resolve)
                    .on('error', reject)
                    .save(tempWavPath);
            });

            const { WaveFile } = require('wavefile');
            const buffer = await fs.readFile(tempWavPath);
            const wav = new WaveFile(buffer);
            wav.toBitDepth('32f');
            let audioData = wav.getSamples();
            if (Array.isArray(audioData)) audioData = audioData[0]; // mono fallback

            // ADVANCED: Use Whisper-Base for significantly better accuracy than Tiny
            const { pipeline } = await import('@xenova/transformers');
            
            console.log("🧠 Loading Intelligent Speech Model (Base-EN)...");
            const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
                quantized: true,
            });

            // CRITICAL FIX: Enabling chunking for long-form audio (prevents [MUSIC][APPLAUSE] truncation)
            console.log("🎤 Transcribing long-form content (this may take a moment)...");
            const output = await transcriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: true,
            });

            transcribedChunks = output.chunks || [{ text: output.text }];
            
            fs.unlink(tempWavPath).catch(() => { }); // Cleanup Temp Wav
        } catch (mlErr) {
            console.error("Local ML Inference Error:", mlErr);
            transcribedChunks = [{ text: `[System Note: Local transcription had an issue. Error: ${mlErr.message}]` }];
        }

        // DESIGN: Build a Premium PDF using Puppeteer
        const transcriptionHtml = transcribedChunks.map(c => {
            const time = c.timestamp ? `[${Math.floor(c.timestamp[0])}s]` : "";
            return `<div style="margin-bottom: 20px; display: flex; gap: 20px; align-items: flex-start;">
                <span style="color: #6366f1; font-weight: 600; font-size: 13px; min-width: 60px; padding-top: 4px;">${time}</span>
                <p style="margin: 0; color: #1f2937; line-height: 1.6; font-size: 15px;">${c.text.trim()}</p>
            </div>`;
        }).join("");

        const browser = await getBrowser();
        const page = await browser.newPage();

        await page.setContent(`
            <html>
            <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap');
                    body { font-family: 'Outfit', sans-serif; padding: 60px; background: #fff; color: #111; }
                    .header { border-bottom: 2px solid #f3f4f6; padding-bottom: 30px; margin-bottom: 40px; }
                    .badge { display: inline-block; background: #eeefff; color: #4f46e5; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 10px; }
                    h1 { font-size: 28px; margin: 0; color: #111827; }
                    .meta { color: #6b7280; font-size: 14px; margin-top: 8px; }
                    .content { margin-top: 40px; }
                    .footer { margin-top: 60px; border-top: 1px solid #f3f4f6; padding-top: 20px; font-size: 12px; color: #9ca3af; text-align: center; }
                </style>
            </head>
            <body>
                <div class="header">
                    <span class="badge">AI-Powered Transcription</span>
                    <h1>Video Notes & Transcript</h1>
                    <div class="meta">Source File: ${file.originalName} • Processed Locally • Secure & Private</div>
                </div>
                <div class="content">
                    ${transcriptionHtml || "<p>No speech detected in the video track.</p>"}
                </div>
                <div class="footer">
                    Generated by Offline Video-to-PDF Converter Tool • Powered by Local AI
                </div>
            </body>
            </html>
        `);

        const outputPath = path.join(__dirname, "../outputs", `transcript-${Date.now()}.pdf`);
        await page.pdf({
            path: outputPath,
            format: "A4",
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });
        await browser.close();

        const pdfFile = await createFileRecord(req, file.originalName.replace(/\.[^/.]+$/, "") + "_transcript.pdf", outputPath, "application/pdf", "convert-video-to-pdf");
        res.json({ success: true, message: "Video transcript generated beautifully with Local AI", file: pdfFile });
    } catch (error) {
        console.error("Video to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.transcribeFile = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        let textResult = "";

        try {
            console.log("🚀 Initializing Premium Offline Audio Transcriber for raw text...");

            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('ffmpeg-static');
            ffmpeg.setFfmpegPath(ffmpegPath);

            const tempWavPath = path.join(__dirname, "../outputs", `temp-transcribe-${Date.now()}.wav`);
            await new Promise((resolve, reject) => {
                ffmpeg(safePath)
                    .format('wav')
                    .audioFrequency(16000)
                    .audioChannels(1)
                    .on('end', resolve)
                    .on('error', reject)
                    .save(tempWavPath);
            });

            const { WaveFile } = require('wavefile');
            const buffer = await fs.readFile(tempWavPath);
            const wav = new WaveFile(buffer);
            wav.toBitDepth('32f');
            let audioData = wav.getSamples();
            if (Array.isArray(audioData)) audioData = audioData[0];

            const { pipeline } = await import('@xenova/transformers');
            
            const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
                quantized: true,
            });

            const output = await transcriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: false,
            });

            textResult = output.text || "";
            
            fs.unlink(tempWavPath).catch(() => { });
        } catch (mlErr) {
            console.error("Local ML Inference Error:", mlErr);
            textResult = `[System Note: Local transcription had an issue. Error: ${mlErr.message}]`;
        }

        res.json({ success: true, text: textResult.trim() });
    } catch (error) {
        console.error("Transcribe API error:", error);
        res.status(500).json({ error: "Transcription failed", details: error.message });
    }
};

exports.transcribeChunk = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No audio blob provided" });
        const filePath = req.file.path;
        
        let textResult = "";

        try {
            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('ffmpeg-static');
            ffmpeg.setFfmpegPath(ffmpegPath);

            const tempWavPath = path.join(__dirname, "../outputs", `temp-chunk-${Date.now()}.wav`);
            await new Promise((resolve, reject) => {
                ffmpeg(filePath)
                    .format('wav')
                    .audioFrequency(16000)
                    .audioChannels(1)
                    .on('end', resolve)
                    .on('error', reject)
                    .save(tempWavPath);
            });

            const { WaveFile } = require('wavefile');
            const buffer = await fs.readFile(tempWavPath);
            const wav = new WaveFile(buffer);
            wav.toBitDepth('32f');
            let audioData = wav.getSamples();
            if (Array.isArray(audioData)) audioData = audioData[0];

            if (!cachedTranscriber) {
                const { pipeline } = await import('@xenova/transformers');
                cachedTranscriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
                    quantized: true,
                });
            }

            const output = await cachedTranscriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: false,
            });

            textResult = output.text || "";
            
            fs.unlink(tempWavPath).catch(() => {});
        } catch (mlErr) {
            console.error("Local Chunk Inference Error:", mlErr);
            textResult = "";
        } finally {
            fs.unlink(filePath).catch(() => {});
        }

        res.json({ success: true, text: textResult.trim() });
    } catch (error) {
        console.error("Transcribe Chunk error:", error);
        res.status(500).json({ error: "Transcription failed", details: error.message });
    }
};

exports.audioToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);
        let transcribedChunks = [];

        try {
            console.log("🚀 Initializing Premium Offline Audio Transcriber...");

            const ffmpeg = require('fluent-ffmpeg');
            const ffmpegPath = require('ffmpeg-static');
            ffmpeg.setFfmpegPath(ffmpegPath);

            const tempWavPath = path.join(__dirname, "../outputs", `temp-${Date.now()}.wav`);
            await new Promise((resolve, reject) => {
                ffmpeg(safePath)
                    .format('wav')
                    .audioFrequency(16000)
                    .audioChannels(1)
                    .on('end', resolve)
                    .on('error', reject)
                    .save(tempWavPath);
            });

            const { WaveFile } = require('wavefile');
            const buffer = await fs.readFile(tempWavPath);
            const wav = new WaveFile(buffer);
            wav.toBitDepth('32f');
            let audioData = wav.getSamples();
            if (Array.isArray(audioData)) audioData = audioData[0];

            const { pipeline } = await import('@xenova/transformers');
            
            console.log("🧠 Loading Intelligent Speech Model (Base-EN)...");
            const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
                quantized: true,
            });

            console.log("🎤 Transcribing long-form audio content...");
            const output = await transcriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: true,
            });

            transcribedChunks = output.chunks || [{ text: output.text }];
            
            fs.unlink(tempWavPath).catch(() => { });
        } catch (mlErr) {
            console.error("Local ML Inference Error:", mlErr);
            transcribedChunks = [{ text: `[System Note: Local transcription had an issue. Error: ${mlErr.message}]` }];
        }

        const transcriptionHtml = transcribedChunks.map(c => {
            const time = c.timestamp ? `[${Math.floor(c.timestamp[0])}s]` : "";
            return `<div style="margin-bottom: 20px; display: flex; gap: 20px; align-items: flex-start;">
                <span style="color: #6366f1; font-weight: 600; font-size: 13px; min-width: 60px; padding-top: 4px;">${time}</span>
                <p style="margin: 0; color: #1f2937; line-height: 1.6; font-size: 15px;">${c.text.trim()}</p>
            </div>`;
        }).join("");

        const browser = await getBrowser();
        const page = await browser.newPage();

        await page.setContent(`
            <html>
            <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap');
                    body { font-family: 'Outfit', sans-serif; padding: 60px; background: #fff; color: #111; }
                    .header { border-bottom: 2px solid #f3f4f6; padding-bottom: 30px; margin-bottom: 40px; }
                    .badge { display: inline-block; background: #eeefff; color: #4f46e5; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 10px; }
                    h1 { font-size: 28px; margin: 0; color: #111827; }
                    .meta { color: #6b7280; font-size: 14px; margin-top: 8px; }
                    .content { margin-top: 40px; }
                    .footer { margin-top: 60px; border-top: 1px solid #f3f4f6; padding-top: 20px; font-size: 12px; color: #9ca3af; text-align: center; }
                </style>
            </head>
            <body>
                <div class="header">
                    <span class="badge">Professional Transcript</span>
                    <h1>Audio Transcription Report</h1>
                    <div class="meta">Source File: ${file.originalName} • Processed Locally (Zero Data Leak) • AI Analyzed</div>
                </div>
                <div class="content">
                    ${transcriptionHtml || "<p>No standard speech detected in the audio file.</p>"}
                </div>
                <div class="footer">
                    Generated by Offline Audio-to-PDF Converter Tool • Private Local AI Analysis
                </div>
            </body>
            </html>
        `);

        const outputPath = path.join(__dirname, "../outputs", `transcript-${Date.now()}.pdf`);
        await page.pdf({
            path: outputPath,
            format: "A4",
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });
        await browser.close();

        const pdfFile = await createFileRecord(req, file.originalName.replace(/\.[^/.]+$/, "") + "_transcript.pdf", outputPath, "application/pdf", "convert-audio-to-pdf");
        res.json({ success: true, message: "Audio processed securely into a premium transcript PDF", file: pdfFile });
    } catch (error) {
        console.error("Audio to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

// SVG to Raster Image (PNG, JPG, WEBP)
exports.svgToImage = async (req, res) => {
    try {
        const { fileId, targetFormat = "png", density = 300 } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const sharp = require("sharp");
        const format = targetFormat.toLowerCase();
        const validFormats = ["png", "jpeg", "jpg", "webp"];
        const outExt = format === "jpeg" ? "jpg" : (validFormats.includes(format) ? format : "png");
        
        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.${outExt}`);
        
        let sharpInstance = sharp(file.path, { density: Number(density) || 300 });

        if (outExt === "jpg" || outExt === "jpeg") {
          sharpInstance = sharpInstance.jpeg({ quality: 95 });
        } else if (outExt === "webp") {
          sharpInstance = sharpInstance.webp({ quality: 90 });
        } else {
          sharpInstance = sharpInstance.png();
        }

        await sharpInstance.toFile(outputPath);

        const newFile = await createFileRecord(
            req,
            file.originalName.replace(/\.[^/.]+$/, "") + `.${outExt}`,
            outputPath,
            `image/${outExt === 'jpg' ? 'jpeg' : outExt}`,
            "svg-to-image"
        );

        res.json({
            success: true,
            message: `SVG successfully converted to ${outExt.toUpperCase()}`,
            file: newFile,
            downloadUrl: `/outputs/${path.basename(outputPath)}`
        });
    } catch (error) {
        console.error("SVG to Image Error:", error);
        res.status(500).json({ error: "SVG to Image conversion failed", details: error.message });
    }
};

// Image Watermark Overlay
exports.watermarkImage = async (req, res) => {
    try {
        const { fileId, text = "WATERMARK", color = "#ffffff", opacity = 0.5, fontSize = 36 } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const sharp = require("sharp");
        const metadata = await sharp(file.path).metadata();
        const imgWidth = metadata.width || 800;
        const imgHeight = metadata.height || 600;

        // Construct SVG overlay for watermarking text
        const svgWatermark = `
          <svg width="${imgWidth}" height="${imgHeight}">
            <style>
              .watermark-text {
                fill: ${color};
                font-size: ${fontSize}px;
                font-family: sans-serif;
                font-weight: bold;
                opacity: ${opacity};
              }
            </style>
            <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="watermark-text">${text}</text>
          </svg>
        `;

        const ext = path.extname(file.originalName) || ".png";
        const outputPath = path.join(__dirname, "../outputs", `watermarked-${Date.now()}${ext}`);

        await sharp(file.path)
            .composite([{ input: Buffer.from(svgWatermark), top: 0, left: 0 }])
            .toFile(outputPath);

        const newFile = await createFileRecord(
            req,
            `watermarked-${file.originalName}`,
            outputPath,
            file.mimeType || "image/png",
            "image-watermark"
        );

        res.json({
            success: true,
            message: "Image watermark added successfully",
            file: newFile,
            downloadUrl: `/outputs/${path.basename(outputPath)}`
        });
    } catch (error) {
        console.error("Image Watermark Error:", error);
        res.status(500).json({ error: "Failed to watermark image", details: error.message });
    }
};

// Image Compressor
exports.compressImage = async (req, res) => {
    try {
        const { fileId, quality = 80 } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const ext = path.extname(file.originalName).toLowerCase();
        const outputPath = path.join(__dirname, "../outputs", `compressed-${Date.now()}${ext}`);
        
        let sharpInstance = sharp(file.path);
        if (ext === ".png") sharpInstance = sharpInstance.png({ quality: Number(quality) });
        else if (ext === ".webp") sharpInstance = sharpInstance.webp({ quality: Number(quality) });
        else sharpInstance = sharpInstance.jpeg({ quality: Number(quality) });

        await sharpInstance.toFile(outputPath);

        const newFile = await createFileRecord(req, `compressed-${file.originalName}`, outputPath, file.mimeType, "compress-image");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to compress image", details: error.message });
    }
};

// PNG to WebP
exports.pngToWebp = async (req, res) => {
    try {
        const { fileId, quality = 80 } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.webp`);
        await sharp(file.path).webp({ quality: Number(quality) }).toFile(outputPath);

        const baseName = path.parse(file.originalName).name;
        const newFile = await createFileRecord(req, `${baseName}.webp`, outputPath, "image/webp", "png-to-webp");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to convert PNG to WebP", details: error.message });
    }
};

// JPG to WebP
exports.jpgToWebp = async (req, res) => {
    try {
        const { fileId, quality = 80 } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.webp`);
        await sharp(file.path).webp({ quality: Number(quality) }).toFile(outputPath);

        const baseName = path.parse(file.originalName).name;
        const newFile = await createFileRecord(req, `${baseName}.webp`, outputPath, "image/webp", "jpg-to-webp");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to convert JPG to WebP", details: error.message });
    }
};

// Extract Color Palette
exports.extractPalette = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const { stats } = await sharp(file.path).stats();
        const colors = stats.channels.slice(0, 3).map((ch, idx) => {
            const hexVal = Math.round(ch.mean).toString(16).padStart(2, "0");
            return idx === 0 ? `#${hexVal}5588` : (idx === 1 ? `#88${hexVal}55` : `#5588${hexVal}`);
        });
        const dominant = `#${Math.round(stats.channels[0].mean).toString(16).padStart(2, "0")}${Math.round(stats.channels[1].mean).toString(16).padStart(2, "0")}${Math.round(stats.channels[2].mean).toString(16).padStart(2, "0")}`;
        
        res.json({ success: true, palette: [dominant, ...colors, "#1e293b", "#f8fafc"] });
    } catch (error) {
        res.status(500).json({ error: "Failed to extract image palette", details: error.message });
    }
};

// Optimize SVG
exports.optimizeSvg = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const svgText = await fs.readFile(file.path, "utf8");
        const cleanedSvg = svgText
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/>\s+</g, "><")
            .trim();

        const outputPath = path.join(__dirname, "../outputs", `optimized-${Date.now()}.svg`);
        await fs.writeFile(outputPath, cleanedSvg);

        const newFile = await createFileRecord(req, `optimized-${file.originalName}`, outputPath, "image/svg+xml", "optimize-svg");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to optimize SVG", details: error.message });
    }
};

// Word to Text
exports.wordToText = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const result = await mammoth.extractRawText({ path: file.path });
        const outputPath = path.join(__dirname, "../outputs", `text-${Date.now()}.txt`);
        await fs.writeFile(outputPath, result.value);

        const baseName = path.parse(file.originalName).name;
        const newFile = await createFileRecord(req, `${baseName}.txt`, outputPath, "text/plain", "word-to-text");
        res.json({ success: true, text: result.value, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to extract text from Word document", details: error.message });
    }
};

// Excel to CSV
exports.excelToCsv = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file.path);
        const worksheet = workbook.worksheets[0];

        let csvData = "";
        worksheet.eachRow((row) => {
            const values = row.values.slice(1).map((val) => `"${String(val !== null && val !== undefined ? val : "").replace(/"/g, '""')}"`);
            csvData += values.join(",") + "\n";
        });

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.csv`);
        await fs.writeFile(outputPath, csvData);

        const baseName = path.parse(file.originalName).name;
        const newFile = await createFileRecord(req, `${baseName}.csv`, outputPath, "text/csv", "excel-to-csv");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to convert Excel to CSV", details: error.message });
    }
};

// CSV to Excel
exports.csvToExcel = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const csvContent = await fs.readFile(file.path, "utf8");
        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Data");

        const rows = csvContent.split("\n").filter((r) => r.trim());
        rows.forEach((row) => {
            const cells = row.split(",").map((c) => c.replace(/^"/, "").replace(/"$/, ""));
            worksheet.addRow(cells);
        });

        const outputPath = path.join(__dirname, "../outputs", `converted-${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(outputPath);

        const baseName = path.parse(file.originalName).name;
        const newFile = await createFileRecord(req, `${baseName}.xlsx`, outputPath, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "csv-to-excel");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to convert CSV to Excel", details: error.message });
    }
};

// Text to Word
exports.textToWord = async (req, res) => {
    try {
        const { text, fileId } = req.body;
        let content = text;
        if (!content && fileId) {
            const file = await File.findById(fileId);
            if (file) content = await fs.readFile(file.path, "utf8");
        }
        if (!content) return res.status(400).json({ error: "No text content provided" });

        const { Document, Packer, Paragraph, TextRun } = require("docx");
        const paragraphs = content.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] }));
        const doc = new Document({ sections: [{ children: paragraphs }] });

        const buffer = await Packer.toBuffer(doc);
        const outputPath = path.join(__dirname, "../outputs", `doc-${Date.now()}.docx`);
        await fs.writeFile(outputPath, buffer);

        const newFile = await createFileRecord(req, `document-${Date.now()}.docx`, outputPath, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text-to-word");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to convert text to Word document", details: error.message });
    }
};

// HTML to Word
exports.htmlToWord = async (req, res) => {
    try {
        const { html, fileId } = req.body;
        let content = html;
        if (!content && fileId) {
            const file = await File.findById(fileId);
            if (file) content = await fs.readFile(file.path, "utf8");
        }
        if (!content) return res.status(400).json({ error: "No HTML content provided" });

        const cleanText = content.replace(/<[^>]+>/g, "\n");
        const { Document, Packer, Paragraph, TextRun } = require("docx");
        const paragraphs = cleanText.split("\n").filter((l) => l.trim()).map((line) => new Paragraph({ children: [new TextRun(line)] }));
        const doc = new Document({ sections: [{ children: paragraphs }] });

        const buffer = await Packer.toBuffer(doc);
        const outputPath = path.join(__dirname, "../outputs", `doc-${Date.now()}.docx`);
        await fs.writeFile(outputPath, buffer);

        const newFile = await createFileRecord(req, `document-${Date.now()}.docx`, outputPath, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "html-to-word");
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to convert HTML to Word document", details: error.message });
    }
};

// Text to Image
exports.textToImage = async (req, res) => {
    try {
        let {
            text = "Hello World",
            bgColor = "#1e293b",
            textColor = "#ffffff",
            fontSize = 48,
            width = 1200,
            height = 630,
            format = "png"
        } = req.body;

        const canvasWidth = Math.max(100, Number(width) || 1200);
        const canvasHeight = Math.max(100, Number(height) || 630);
        let currentFontSize = Math.max(12, Number(fontSize) || 48);

        const targetFormat = ["png", "jpg", "jpeg", "webp"].includes(format) ? format : "png";
        const ext = targetFormat === "jpeg" ? "jpg" : targetFormat;

        // Word Wrapping Algorithm for SVG
        const wrapTextToLines = (rawText, fSize, cWidth) => {
            const printableWidth = cWidth * 0.88; // 6% padding on left and right
            const charWidthApprox = fSize * 0.58; // Avg character width for bold sans-serif
            const maxCharsPerLine = Math.max(5, Math.floor(printableWidth / charWidthApprox));

            const rawParagraphs = rawText.split(/\r?\n/);
            const finalLines = [];

            for (const para of rawParagraphs) {
                if (!para.trim()) {
                    finalLines.push("");
                    continue;
                }
                const words = para.split(/\s+/);
                let currentLine = "";

                for (const word of words) {
                    if (!currentLine) {
                        currentLine = word;
                    } else if ((currentLine + " " + word).length <= maxCharsPerLine) {
                        currentLine += " " + word;
                    } else {
                        finalLines.push(currentLine);
                        currentLine = word;
                    }
                }
                if (currentLine) {
                    finalLines.push(currentLine);
                }
            }
            return finalLines;
        };

        // Auto-scale font size if total text block height exceeds available canvas height
        let lines = wrapTextToLines(text, currentFontSize, canvasWidth);
        const maxAllowedHeight = canvasHeight * 0.85;

        while (currentFontSize > 12 && (lines.length * (currentFontSize * 1.35)) > maxAllowedHeight) {
            currentFontSize -= 2;
            lines = wrapTextToLines(text, currentFontSize, canvasWidth);
        }

        const lineHeight = currentFontSize * 1.35;
        const totalBlockHeight = lines.length * lineHeight;
        const startY = (canvasHeight - totalBlockHeight) / 2 + (currentFontSize * 0.9);

        const tspanElements = lines.map((line, idx) => {
            const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            return `<tspan x="50%" dy="${idx === 0 ? 0 : lineHeight}">${escaped || ' '}</tspan>`;
        }).join("\n");

        const svg = `
        <svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="${bgColor}"/>
            <text x="50%" y="${startY}" font-family="sans-serif, Arial, Helvetica" font-size="${currentFontSize}" font-weight="bold" fill="${textColor}" text-anchor="middle">
                ${tspanElements}
            </text>
        </svg>`;

        const outputPath = path.join(__dirname, "../outputs", `text-image-${Date.now()}.${ext}`);
        
        let sharpInstance = sharp(Buffer.from(svg));
        if (targetFormat === "jpg" || targetFormat === "jpeg") {
            sharpInstance = sharpInstance.jpeg({ quality: 95 });
        } else if (targetFormat === "webp") {
            sharpInstance = sharpInstance.webp({ quality: 95 });
        } else {
            sharpInstance = sharpInstance.png();
        }

        await sharpInstance.toFile(outputPath);

        const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
        const newFile = await createFileRecord(req, `text-image-${Date.now()}.${ext}`, outputPath, mimeMap[targetFormat] || "image/png", "text-to-image");
        
        res.json({ success: true, file: newFile, downloadUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        console.error("Text to Image error:", error);
        res.status(500).json({ error: "Failed to generate text image", details: error.message });
    }
};




