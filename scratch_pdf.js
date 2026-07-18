const fs = require('fs');
const PDFParser = require('pdf2json');
const path = require('path');

const parser = new PDFParser();

parser.on("pdfParser_dataError", errData => console.error(errData.parserError));
parser.on("pdfParser_dataReady", pdfData => {
    const page = pdfData.Pages[0];
    const texts = page.Texts.filter(t => t.R[0].T.includes("Active"));
    console.log("Active texts:", JSON.stringify(texts, null, 2));
});

parser.loadPDF(path.join(__dirname, 'outputs/converted-1784368086750.pdf'));
