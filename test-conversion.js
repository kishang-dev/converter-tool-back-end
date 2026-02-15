const { pdfToWord } = require('./utils/pdfUtils');
const path = require('path');

async function testConversion() {
    try {
        const filePath = path.join(__dirname, 'complex.pdf');
        console.log("Starting conversion for complex.pdf...");
        const outputPath = await pdfToWord(filePath);
        console.log("Conversion successful!");
        console.log("Output path:", outputPath);
    } catch (e) {
        console.error("Conversion failed:", e);
    }
}

testConversion();
