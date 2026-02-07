const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log('Installing Chrome...');
        const browser = await puppeteer.createBrowserFetcher().download(puppeteer.PUPPETEER_REVISIONS.chrome);
        console.log('Chrome installed:', browser.folderPath);
    } catch (e) {
        console.error('Error installing Chrome:', e);
    }
})();
