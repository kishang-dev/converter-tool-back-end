const xml2js = require("xml2js");
const prettier = require("prettier");
const { format: formatSql } = require("sql-formatter");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");
const htmlMinifier = require("html-minifier");

// 1. Base64
exports.base64Encode = (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: "Text is required" });
        const encoded = Buffer.from(text).toString("base64");
        res.json({ success: true, result: encoded });
    } catch (error) {
        res.status(500).json({ error: "Base64 encode failed", details: error.message });
    }
};

exports.base64Decode = (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: "Text is required" });
        const decoded = Buffer.from(text, "base64").toString("utf-8");
        res.json({ success: true, result: decoded });
    } catch (error) {
        res.status(500).json({ error: "Base64 decode failed", details: error.message });
    }
};

// 2. JSON Operations
exports.formatJson = (req, res) => {
    try {
        const { json, indent = 2 } = req.body;
        if (!json) return res.status(400).json({ error: "JSON is required" });
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        res.json({ success: true, result: JSON.stringify(parsed, null, indent) });
    } catch (error) {
        res.status(400).json({ error: "Invalid JSON", details: error.message });
    }
};

exports.minifyJson = (req, res) => {
    try {
        const { json } = req.body;
        if (!json) return res.status(400).json({ error: "JSON is required" });
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        res.json({ success: true, result: JSON.stringify(parsed) });
    } catch (error) {
        res.status(400).json({ error: "Invalid JSON", details: error.message });
    }
};

exports.validateJson = (req, res) => {
    try {
        const { json } = req.body;
        if (!json) return res.status(400).json({ error: "JSON is required" });
        typeof json === "string" ? JSON.parse(json) : json;
        res.json({ success: true, isValid: true, message: "Valid JSON" });
    } catch (error) {
        res.json({ success: true, isValid: false, message: error.message });
    }
};

// 3. XML Tool
exports.xmlToJson = (req, res) => {
    try {
        const { xml } = req.body;
        if (!xml) return res.status(400).json({ error: "XML is required" });
        xml2js.parseString(xml, { explicitArray: false }, (err, result) => {
            if (err) return res.status(400).json({ error: "Invalid XML", details: err.message });
            res.json({ success: true, result: JSON.stringify(result, null, 2) });
        });
    } catch (error) {
        res.status(500).json({ error: "XML to JSON failed", details: error.message });
    }
};

exports.jsonToXml = (req, res) => {
    try {
        const { json, rootName = "root", itemName = "item", attrPrefix = "@", indent = 2 } = req.body;
        if (!json) return res.status(400).json({ error: "JSON is required" });
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        const builder = new xml2js.Builder({
            rootName,
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            attrkey: attrPrefix,
            renderOpts: { pretty: true, indent: ' '.repeat(Number(indent) || 2) }
        });
        const xml = builder.buildObject(parsed);
        res.json({ success: true, result: xml });
    } catch (error) {
        res.status(400).json({ error: "Invalid JSON", details: error.message });
    }
};

// 4. SQL Formatter
exports.formatSql = (req, res) => {
    try {
        const { sql } = req.body;
        if (!sql) return res.status(400).json({ error: "SQL is required" });
        const formatted = formatSql(sql, { language: 'sql', tabWidth: 2 });
        res.json({ success: true, result: formatted });
    } catch (error) {
        res.status(500).json({ error: "SQL formatting failed", details: error.message });
    }
};

// 5. Code Minifier (HTML, CSS, JS)
exports.minifyCode = (req, res) => {
    try {
        const { code, type } = req.body;
        if (!code || !type) return res.status(400).json({ error: "Code and type are required" });

        let result = code;
        if (type === "html") {
            result = htmlMinifier.minify(code, {
                collapseWhitespace: true,
                removeComments: true,
                minifyJS: true,
                minifyCSS: true
            });
        } else if (type === "css") {
            const cssOutput = new CleanCSS({}).minify(code);
            result = cssOutput.styles;
        } else if (type === "js" || type === "javascript") {
            const jsOutput = UglifyJS.minify(code);
            if (jsOutput.error) throw jsOutput.error;
            result = jsOutput.code;
        } else {
            return res.status(400).json({ error: "Unsupported type. Use html, css, or js" });
        }

        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: "Minification failed", details: error.message });
    }
};

// 6. Cryptographic Hashes & UUID Generator
exports.generateHashes = (req, res) => {
    try {
        const crypto = require("crypto");
        const { text = "", secretKey = "", isUppercase = false } = req.body;

        const formatHash = (str) => (isUppercase ? str.toUpperCase() : str.toLowerCase());

        let md5, sha1, sha256, sha512;
        if (secretKey) {
            md5 = crypto.createHmac("md5", secretKey).update(text).digest("hex");
            sha1 = crypto.createHmac("sha1", secretKey).update(text).digest("hex");
            sha256 = crypto.createHmac("sha256", secretKey).update(text).digest("hex");
            sha512 = crypto.createHmac("sha512", secretKey).update(text).digest("hex");
        } else {
            md5 = crypto.createHash("md5").update(text).digest("hex");
            sha1 = crypto.createHash("sha1").update(text).digest("hex");
            sha256 = crypto.createHash("sha256").update(text).digest("hex");
            sha512 = crypto.createHash("sha512").update(text).digest("hex");
        }
        const uuidv4 = crypto.randomUUID();

        res.json({
            success: true,
            result: {
                md5: formatHash(md5),
                sha1: formatHash(sha1),
                sha256: formatHash(sha256),
                sha512: formatHash(sha512),
                uuid: uuidv4,
                isHmac: Boolean(secretKey)
            }
        });
    } catch (error) {
        res.status(500).json({ error: "Hash generation failed", details: error.message });
    }
};

// 7. URL Encoder, Decoder & Query Parser
exports.processUrl = (req, res) => {
    try {
        const { url = "", action = "parse" } = req.body;
        if (!url) return res.status(400).json({ error: "URL or string input is required" });

        let encoded = "";
        let decoded = "";
        let base64Url = "";
        let parsed = null;

        try {
            encoded = encodeURIComponent(url);
            decoded = decodeURIComponent(url);
            base64Url = Buffer.from(url).toString("base64url");
        } catch (e) {}

        try {
            const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
            const queryParams = {};
            urlObj.searchParams.forEach((val, key) => {
                queryParams[key] = val;
            });
            parsed = {
                protocol: urlObj.protocol,
                host: urlObj.host,
                hostname: urlObj.hostname,
                port: urlObj.port,
                pathname: urlObj.pathname,
                search: urlObj.search,
                hash: urlObj.hash,
                queryParams
            };
        } catch (e) {}

        res.json({
            success: true,
            result: {
                original: url,
                encoded,
                decoded,
                base64Url,
                parsed
            }
        });
    } catch (error) {
        res.status(500).json({ error: "URL processing failed", details: error.message });
    }
};

// 8. HTML Formatter & Sanitizer
exports.formatHtml = (req, res) => {
    try {
        const { code = "" } = req.body;
        const formatted = code
            .replace(/></g, ">\n<")
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join("\n");
        res.json({ success: true, result: formatted });
    } catch (error) {
        res.status(500).json({ error: "HTML formatting failed", details: error.message });
    }
};

// 9. CSS Formatter
exports.formatCss = (req, res) => {
    try {
        const { code = "" } = req.body;
        const formatted = code
            .replace(/\s*{\s*/g, " {\n  ")
            .replace(/;\s*/g, ";\n  ")
            .replace(/\s*}\s*/g, "\n}\n\n")
            .trim();
        res.json({ success: true, result: formatted });
    } catch (error) {
        res.status(500).json({ error: "CSS formatting failed", details: error.message });
    }
};

// 10. JS/TS Formatter
exports.formatJs = (req, res) => {
    try {
        const { code = "" } = req.body;
        const formatted = code
            .replace(/;\s*/g, ";\n")
            .replace(/{\s*/g, "{\n  ")
            .replace(/}\s*/g, "\n}\n");
        res.json({ success: true, result: formatted });
    } catch (error) {
        res.status(500).json({ error: "JS formatting failed", details: error.message });
    }
};

// 11. String Case Converter
exports.convertCase = (req, res) => {
    try {
        const { text = "" } = req.body;
        const words = text.split(/[\s_\-]+/).filter((w) => w.length > 0);
        
        const camelCase = words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join("");
        const pascalCase = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
        const snakeCase = words.map((w) => w.toLowerCase()).join("_");
        const kebabCase = words.map((w) => w.toLowerCase()).join("-");
        const constantCase = words.map((w) => w.toUpperCase()).join("_");
        const upperCase = text.toUpperCase();
        const lowerCase = text.toLowerCase();
        const titleCase = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        const sentenceCase = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        const toggleCase = text.split("").map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("");
        const dotCase = words.map((w) => w.toLowerCase()).join(".");

        const charCount = text.length;
        const wordCount = words.length;
        const lineCount = text ? text.split(/\r\n|\r|\n/).length : 0;

        res.json({
            success: true,
            result: {
                camelCase,
                pascalCase,
                snakeCase,
                kebabCase,
                constantCase,
                titleCase,
                sentenceCase,
                upperCase,
                lowerCase,
                toggleCase,
                dotCase,
                stats: { charCount, wordCount, lineCount }
            }
        });
    } catch (error) {
        res.status(500).json({ error: "Case conversion failed", details: error.message });
    }
};

// 12. Text Difference Checker
exports.compareTextDiff = (req, res) => {
    try {
        const { original = "", modified = "", ignoreWhitespace = false, ignoreCase = false } = req.body;
        const origLines = original.split("\n");
        const modLines = modified.split("\n");
        const maxLines = Math.max(origLines.length, modLines.length);

        const diffs = [];
        let addedCount = 0;
        let removedCount = 0;
        let modifiedCount = 0;
        let unchangedCount = 0;

        for (let i = 0; i < maxLines; i++) {
            let lineOrig = origLines[i] !== undefined ? origLines[i] : "";
            let lineMod = modLines[i] !== undefined ? modLines[i] : "";

            let cmpOrig = ignoreWhitespace ? lineOrig.trim() : lineOrig;
            let cmpMod = ignoreWhitespace ? lineMod.trim() : lineMod;
            if (ignoreCase) {
                cmpOrig = cmpOrig.toLowerCase();
                cmpMod = cmpMod.toLowerCase();
            }

            let status = "unchanged";
            if (cmpOrig !== cmpMod) {
                if (origLines[i] === undefined) { status = "added"; addedCount++; }
                else if (modLines[i] === undefined) { status = "removed"; removedCount++; }
                else { status = "modified"; modifiedCount++; }
            } else {
                unchangedCount++;
            }
            diffs.push({ line: i + 1, original: lineOrig, modified: lineMod, status });
        }

        res.json({
            success: true,
            diffs,
            stats: { addedCount, removedCount, modifiedCount, unchangedCount }
        });
    } catch (error) {
        res.status(500).json({ error: "Text diff comparison failed", details: error.message });
    }
};


