const fs = require("fs-extra");
const path = require("path");
const potrace = require("potrace");
const {
    createMultiplePaths,
    generateMultiPathSVG,
    extractColorsFromImage,
    createGradientDefs,
} = require("../utils/svgUtils");

const svgDir = path.join(__dirname, "../outputs/svg");

/**
 * Upload and convert image to SVG
 */
exports.convertImageToSVG = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image uploaded." });
    }

    const inputPath = req.file.path;
    const baseFilename = req.file.filename.replace(path.extname(req.file.filename), "");
    const outputFilename = baseFilename + ".svg";
    const outputPath = path.join(svgDir, outputFilename);

    try {
        fs.ensureDirSync(svgDir);

        const isSvg =
            req.file.mimetype === "image/svg+xml" ||
            req.file.originalname.toLowerCase().endsWith(".svg");

        let svgContent = "";

        if (isSvg) {
            svgContent = fs.readFileSync(inputPath, "utf8");
        } else {
            svgContent = await new Promise((resolve, reject) => {
                const imageBuffer = fs.readFileSync(path.resolve(inputPath));
                potrace.trace(
                    imageBuffer,
                    {
                        threshold: 128,
                        optTolerance: 0.2,
                        turdSize: 2,
                        turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY,
                        alphaMax: 1,
                        optiCurve: true,
                    },
                    (err, svg) => {
                        if (err) {
                            reject(new Error("Failed to trace image. Ensure it is a valid raster format."));
                        } else {
                            resolve(svg);
                        }
                    }
                );
            });
        }

        if (!svgContent) {
            throw new Error("Failed to obtain SVG content.");
        }

        const paths = createMultiplePaths(svgContent);
        const multiPathSVG = generateMultiPathSVG(paths, svgContent);

        fs.writeFileSync(outputPath, multiPathSVG);

        // Clean up uploaded image
        if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
        }

        const File = require("../models/File");
        const svgFile = await File.create({
            filename: outputFilename,
            originalName: req.file.originalname,
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "image/svg+xml",
            operation: "image",
            status: "completed",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({
            message: "Image converted to multi-path SVG successfully.",
            svgUrl: `/svg/${outputFilename}`,
            filename: outputFilename,
            paths: paths,
            editUrl: `/editor/${baseFilename}`,
            fileId: svgFile._id
        });
    } catch (error) {
        console.error("Conversion error:", error);
        if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
        }
        res.status(500).json({
            error: "Error converting image to SVG: " + error.message,
        });
    }
};

/**
 * Extract color analysis for an existing image
 */
exports.analyzeColors = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image uploaded." });
    }

    const inputPath = req.file.path;

    try {
        const colorData = await extractColorsFromImage(inputPath, 10);

        if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
        }

        res.json({
            message: "Color analysis completed.",
            colorAnalysis: colorData,
        });
    } catch (error) {
        console.error("Color analysis error:", error);
        if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
        }
        res.status(500).json({
            error: "Error analyzing colors: " + error.message,
        });
    }
};

/**
 * Update SVG colors
 */
exports.updateSVGColors = async (req, res) => {
    const { filename, newColors, useGradients } = req.body;

    if (!filename || !newColors) {
        return res.status(400).json({ error: "Filename and new colors are required." });
    }

    const svgPath = path.join(svgDir, filename);

    if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: "SVG file not found." });
    }

    try {
        let svgContent = fs.readFileSync(svgPath, "utf8");
        const pathRegex = /<path([^>]*)>/g;
        let pathIndex = 0;

        svgContent = svgContent.replace(pathRegex, (match, attributes) => {
            const colorIndex = pathIndex % newColors.length;
            const newColor = newColors[colorIndex];

            let newAttributes = attributes.replace(/fill="[^"]*"/, "");
            newAttributes += ` fill="${useGradients && pathIndex === 0 ? "url(#linearGrad)" : newColor}"`;

            pathIndex++;
            return `<path${newAttributes}>`;
        });

        if (useGradients && newColors.length > 1) {
            const gradientDefs = createGradientDefs(newColors, true);
            svgContent = svgContent.replace(/(<svg[^>]*>)/, `$1\n${gradientDefs}`);
        }

        fs.writeFileSync(svgPath, svgContent);

        res.json({
            message: "SVG colors updated successfully.",
            svgUrl: `/api/svg/${filename}`,
        });
    } catch (error) {
        console.error("Error updating SVG colors:", error);
        res.status(500).json({
            error: "Error updating SVG colors: " + error.message,
        });
    }
};
