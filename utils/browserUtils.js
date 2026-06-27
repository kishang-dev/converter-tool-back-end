const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const defaultArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu"
];

function fileExists(filePath) {
    return Boolean(filePath) && fs.existsSync(filePath);
}

function getCandidatePaths() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_BIN
    ];

    try {
        candidates.push(puppeteer.executablePath());
    } catch (error) {
        console.warn("Unable to resolve Puppeteer's bundled Chrome path:", error.message);
    }

    if (process.platform === "win32") {
        candidates.push(
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
        );
    } else if (process.platform === "darwin") {
        candidates.push(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium"
        );
    } else {
        candidates.push(
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser"
        );
    }

    return [...new Set(candidates.filter(Boolean))];
}

function getChromeExecutablePath() {
    return getCandidatePaths().find(fileExists);
}

/**
 * Ultra-robust browser initiator ensuring Live Server and Local setups never crash.
 * Falls back to system Chrome paths if the local Puppeteer cache is missing or corrupt.
 */
async function getBrowser() {
    const executablePath = getChromeExecutablePath();

    if (executablePath) {
        console.log(`Launching Chrome for previews from: ${executablePath}`);
        return await puppeteer.launch({
            headless: "new",
            executablePath,
            args: defaultArgs
        });
    }

    try {
        return await puppeteer.launch({
            headless: "new",
            args: defaultArgs
        });
    } catch (error) {
        const checkedPaths = getCandidatePaths().join(", ");
        throw new Error(
            `Chrome browser was not found. Run "npx puppeteer browsers install chrome" during deployment, ` +
            `install Chrome/Chromium on the server, or set PUPPETEER_EXECUTABLE_PATH/CHROME_BIN to a valid Chrome executable. ` +
            `Checked paths: ${checkedPaths}. Original error: ${error.message}`
        );
    }
}

module.exports = { getBrowser };
