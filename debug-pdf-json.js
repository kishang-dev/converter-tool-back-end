const fs = require('fs');
const PDFParser = require("pdf2json");
const { PDFDocument, rgb } = require("pdf-lib");

(async () => {
    try {
        // 1. Create a known PDF
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 600]); // 600x600 points
        const { width, height } = page.getSize();

        // Add text at specific coordinates (PDF coordinates are bottom-left origin usually, 
        // but pdf-lib drawing is:
        // x: from left
        // y: from bottom (by default)

        // Let's draw at x=72 (1 inch), y=528 (1 inch from top, since 600-72=528)
        page.drawText('TestText', {
            x: 72,
            y: 528,
            size: 24,
            color: rgb(0, 0, 0),
        });

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync('debug.pdf', pdfBytes);
        console.log("Created debug.pdf (600x600 pts). Text 'TestText' at x=72, y=528 (bottom-left) -> Top-Left approx 1 inch, 1 inch.");

        // 2. Parse with pdf2json
        const pdfParser = new PDFParser();

        pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
        pdfParser.on("pdfParser_dataReady", pdfData => {
            const page = pdfData.formImage.Pages[0];
            console.log("\n--- pdf2json Output ---");
            console.log("Page Width (units):", page.Width);
            console.log("Page Height (units):", page.Height);

            if (page.Texts && page.Texts[0]) {
                const text = page.Texts[0];
                console.log("Text x:", text.x);
                console.log("Text y:", text.y);
                console.log("Content:", decodeURIComponent(text.R[0].T));
                console.log("Font Size Index/Val:", text.R[0].TS[1]);

                // Calculate ratios
                // We expect x to represent 72 pts.
                // We expect y to represent 72 pts (from top).

                console.log("\n--- Analysis ---");
                console.log("Ratio Width (600 / val):", 600 / page.Width);
                console.log("Ratio Height (600 / val):", 600 / page.Height);
                console.log("Calc x (val * RatioW):", text.x * (600 / page.Width));
                console.log("Calc y (val * RatioH):", text.y * (600 / page.Height));
            }
        });

        pdfParser.loadPDF('debug.pdf');

    } catch (e) {
        console.error(e);
    }
})();
