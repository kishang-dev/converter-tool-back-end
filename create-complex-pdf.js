const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");

async function createComplexPdf() {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Heading
    page.drawText("Main Heading", {
        x: 50,
        y: 750,
        size: 24,
        font: boldFont,
        color: rgb(0, 0, 0.8)
    });

    // Sub-heading
    page.drawText("Sub Heading", {
        x: 50,
        y: 710,
        size: 18,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.2)
    });

    // Paragraph 1
    const text1 = "This is the first paragraph. It has multiple lines of text. We want to see if the converter can properly group these lines into a single paragraph in Word.";
    page.drawText(text1, {
        x: 50,
        y: 670,
        size: 11,
        font: font,
        maxWidth: 500,
        lineHeight: 14
    });

    // Paragraph 2 (with gap)
    const text2 = "This is the second paragraph, separated by a gap. It should be a distinct paragraph in the resulting Word document.";
    page.drawText(text2, {
        x: 50,
        y: 600,
        size: 11,
        font: font,
        maxWidth: 500,
        lineHeight: 14
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('complex.pdf', pdfBytes);
    console.log("Created complex.pdf");
}

createComplexPdf();
