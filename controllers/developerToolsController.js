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
        const { json } = req.body;
        if (!json) return res.status(400).json({ error: "JSON is required" });
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        const builder = new xml2js.Builder();
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
