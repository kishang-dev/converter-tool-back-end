const { PDFExtract } = require('pdf.js-extract');
const path = require('path');

async function test() {
    try {
        const extractor = new PDFExtract();
        console.log("PDFExtract initialized successfully");
    } catch (err) {
        console.error("Error:", err);
    }
}

test();
