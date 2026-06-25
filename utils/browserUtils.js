const puppeteer = require("puppeteer");
const path = require("path");

/**
 * Ultra-robust browser initiator ensuring Live Server and Local setups never crash.
 * Falls back to system Chrome paths if the local Puppeteer cache is missing or corrupt.
 */
async function getBrowser() {
    const defaultArgs = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu"
    ];

    try {
        // Strategy 1: Standard Puppeteer Cache (Local Development)
        return await puppeteer.launch({
            headless: "new",
            args: defaultArgs
        });
    } catch (err) {
        console.warn("Puppeteer cache missing. Defaulting to System Google Chrome fallback...", err.message);

        // Strategy 2: System Paths (Linux/Mac/Windows Local)
        const sysPath = process.env.PUPPETEER_EXECUTABLE_PATH
            || (process.platform === 'win32'
                ? [
                    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                    path.join(process.env.LOCALAPPDATA || '', "Google\\Chrome\\Application\\chrome.exe")
                ].find(p => require('fs').existsSync(p))
                : "/usr/bin/google-chrome"
            );

        return await puppeteer.launch({
            headless: "new",
            executablePath: sysPath,
            args: defaultArgs
        });
    }
}

module.exports = { getBrowser };
