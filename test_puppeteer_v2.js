const puppeteer = require('puppeteer');

async function testPuppeteer() {
    try {
        console.log('Attempting launch...');
        const browser = await puppeteer.launch();
        console.log('Success!');
        await browser.close();
    } catch (err) {
        console.error('ERROR_DETAILS:', err.name, err.message);
        if (err.stack) console.error('STACK:', err.stack);
    }
}

testPuppeteer();
