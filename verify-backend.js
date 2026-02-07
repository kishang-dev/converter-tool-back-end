const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const ExcelJS = require('exceljs');

const API_URL = 'http://localhost:5000/api';

async function createSampleFiles() {
    console.log('Creating sample files...');

    // 1. Create Sample PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    page.drawText('Hello World! This is a test PDF for conversion.');
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('test.pdf', pdfBytes);

    // 2. Create Sample HTML
    fs.writeFileSync('test.html', '<html><body><h1>Hello World</h1><p>Test HTML to PDF</p></body></html>');

    // 3. Create Sample Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['Name', 'Value']);
    sheet.addRow(['Test', 123]);
    await workbook.xlsx.writeFile('test.xlsx');

    console.log('Sample files created.');
}

async function uploadFile(filename) {
    const form = new FormData();
    form.append('files', fs.createReadStream(filename));

    try {
        const res = await axios.post(`${API_URL}/files/upload`, form, {
            headers: {
                ...form.getHeaders()
            }
        });
        return res.data.files[0];
    } catch (error) {
        console.error(`Upload failed for ${filename}:`, error.message);
        throw error;
    }
}

async function testConversion(endpoint, fileId, name) {
    try {
        console.log(`Testing ${name}...`);
        const res = await axios.post(`${API_URL}/${endpoint}`, { fileId });
        if (res.data.success) {
            console.log(`✅ ${name} Success!`, res.data.message);
        } else {
            console.error(`❌ ${name} Failed (Success=false)`);
        }
    } catch (error) {
        if (error.response && error.response.status === 501) {
            console.log(`⚠️ ${name} Not Implemented (Expected for PPTX->PDF): ${error.response.data.error}`);
        } else {
            console.error(`❌ ${name} Error:`, error.response ? error.response.data : error.message);
        }
    }
}

async function runTests() {
    await createSampleFiles();

    try {
        // Upload files
        const pdfFile = await uploadFile('test.pdf');
        const htmlFile = await uploadFile('test.html');
        const excelFile = await uploadFile('test.xlsx');

        // Test Conversions
        await testConversion('pdf-to-pptx', pdfFile._id, 'PDF to PPTX');
        await testConversion('pdf-to-text', pdfFile._id, 'PDF to Text');
        await testConversion('pdf-to-html', pdfFile._id, 'PDF to HTML');

        await testConversion('html-to-pdf', htmlFile._id, 'HTML to PDF');

        await testConversion('excel-to-pdf', excelFile._id, 'Excel to PDF');

        // PPT to PDF (Testing with dummy file if we had one, but we don't have a valid PPTX generator easily)
        // We can try to upload the converted PPTX from step 1 if it worked?
        // But for now, let's skip or try with a dummy file renamed
        // await testConversion('ppt-to-pdf', ...); 

    } catch (e) {
        console.error("Test Suite Failed:", e.message);
    } finally {
        // Cleanup
        try {
            fs.unlinkSync('test.pdf');
            fs.unlinkSync('test.html');
            fs.unlinkSync('test.xlsx');
        } catch (e) { }
    }
}

runTests();
