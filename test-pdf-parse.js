const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

async function test() {
    try {
        console.log('Type of pdfParse:', typeof pdfParse);
        console.log('pdfParse:', pdfParse);

        // Create a dummy PDF file if not exists or use an existing one
        // For simplicity, let's just use the require check which failed if it's not a function

        if (typeof pdfParse !== 'function') {
            console.error('pdfParse is NOT a function!');
            if (typeof pdfParse.default === 'function') {
                console.log('But pdfParse.default IS a function. Maybe use that?');
            }
        } else {
            console.log('pdfParse IS a function. It should work.');
        }

    } catch (e) {
        console.error(e);
    }
}

test();
