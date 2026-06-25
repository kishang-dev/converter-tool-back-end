const { PDFExtract } = require('pdf.js-extract');
const path = require('path');
const fs = require('fs');

async function testExtract() {
    const extractor = new PDFExtract();
    const filePath = path.join(__dirname, 'debug.pdf');
    if (!fs.existsSync(filePath)) {
        console.log("debug.pdf not found, creating it first run...");
        // This is just for local testing if needed
        return;
    }
    
    try {
        const data = await extractor.extract(filePath, {});
        console.log("PDF Extract Data for page 1:");
        if (data.pages && data.pages.length > 0) {
            console.log(JSON.stringify(data.pages[0].content.slice(0, 5), null, 2));
            console.log("Total items:", data.pages[0].content.length);
        } else {
            console.log("No pages found");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

testExtract();
