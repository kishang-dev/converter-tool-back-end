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

        const originalBase = path.getBasename ? path.getBasename(file.originalName) : path.parse(file.originalName).name;
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

        let extractedText = "";
        try {
            console.log("Loading offline AI Transcriber...");

            // Require static FFMPEG executable & Fluent wrapper dynamically
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

            // Fire up the completely local offline AI Transformer! (No Paid Keys!)
            const { pipeline } = await import('@xenova/transformers'); // Dynamic import for ESM modules safely
            console.log("Downloading/Loading localized Xenova ONNX model (~50MB)...");
            const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
                quantized: true, // heavily optimized WASM
            });

            const output = await transcriber(audioData);
            extractedText = output.text;

            fs.unlink(tempWavPath).catch(() => { }); // Cleanup Temp Wav

            if (!extractedText.trim()) extractedText = "[Video contained no easily detectable speech.]";
        } catch (mlErr) {
            console.error("Local ML Offline Inference Error:", mlErr);
            extractedText += `\n[System Error: The offline local JS AI engine could not boot correctly. Details: ${mlErr.message}]\n`;
        }

        const notes = `Offline Video Transcription\n\nVideo Source: ${file.originalName}\nStatus: Processed Locally (Zero Paid API Keys Used)\n\n\nAI Speech Extraction:\n\n${extractedText}`;

        const outputPath = path.join(__dirname, "../outputs", `notes-${Date.now()}.pdf`);
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        doc.fontSize(18).text(`Video AI Transcript: ${path.basename(file.originalName)}`).moveDown();
        doc.fontSize(12).text(notes);
        doc.end();

        await new Promise((resolve) => stream.on("finish", resolve));

        const originalBase = path.parse(file.originalName).name;
        const pdfFile = await createFileRecord(req, `${originalBase}_notes.pdf`, outputPath, "application/pdf", "convert-video-to-pdf");
        res.json({ success: true, message: "Video notes generated to PDF securely (Offline AI)", file: pdfFile });
    } catch (error) {
        console.error("Video to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.audioToPdf = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const safePath = resolveFilePath(file.path);

        let extractedText = "";
        try {
            console.log("Loading offline AI Audio Transcriber...");

            // Require static FFMPEG executable & Fluent wrapper dynamically
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

            // Fire up the completely local offline AI Transformer! (No Paid Keys!)
            const { pipeline } = await import('@xenova/transformers'); // Dynamic import for ESM modules safely
            console.log("Downloading/Loading localized Xenova ONNX model (~50MB)...");
            const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
                quantized: true, // heavily optimized WASM
            });

            const output = await transcriber(audioData);
            extractedText = output.text;

            fs.unlink(tempWavPath).catch(() => { }); // Cleanup Temp Wav

            if (!extractedText.trim()) extractedText = "[Audio track contained no easily detectable speech.]";
        } catch (mlErr) {
            console.error("Local ML Offline Inference Error:", mlErr);
            extractedText += `\n[System Error: The offline local JS AI engine could not boot correctly. Details: ${mlErr.message}]\n`;
        }

        const notes = `Offline Audio Transcription Report\n\nAudio Source: ${file.originalName}\nStatus: Transcribed Locally (Zero Paid API Keys Used)\n\n\nAI Transcript Output:\n\n${extractedText}`;

        const outputPath = path.join(__dirname, "../outputs", `transcript-${Date.now()}.pdf`);
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        doc.fontSize(16).text(`Offline Audio Processing (${path.extname(file.originalName)})`).moveDown();
        doc.fontSize(12).text(notes);
        doc.end();

        await new Promise((resolve) => stream.on("finish", resolve));

        const originalBase = path.parse(file.originalName).name;
        const pdfFile = await createFileRecord(req, `${originalBase}_transcript.pdf`, outputPath, "application/pdf", "convert-audio-to-pdf");
        res.json({ success: true, message: "Audio processed securely (Offline AI)", file: pdfFile });
    } catch (error) {
        console.error("Audio to PDF error:", error);
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};
