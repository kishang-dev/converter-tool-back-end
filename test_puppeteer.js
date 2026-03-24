const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

async function testPuppeteer() {
    console.log('Starting Puppeteer launch test...');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox"]
        });
        console.log('✅ Puppeteer launched successfully!');

        const page = await browser.newPage();
        await page.goto('https://example.com');
        const title = await page.title();
        console.log(`✅ Page loaded! Title: ${title}`);

        // Test PDF.js CDN
        console.log('Testing PDF.js CDN access...');
        const pdfJsUrl = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
        await page.goto('about:blank');
        await page.setContent(`<script src="${pdfJsUrl}"></script>`);

        const exists = await page.evaluate(() => typeof window.pdfjsLib !== 'undefined');
        console.log(`✅ PDF.js loaded from CDN: ${exists}`);

    } catch (err) {
        console.error('❌ Puppeteer test failed:', err);
    } finally {
        if (browser) await browser.close();
        console.log('Test completed.');
    }
}

testPuppeteer();
