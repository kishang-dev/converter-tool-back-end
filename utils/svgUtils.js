const fs = require("fs-extra");
const path = require("path");
const Jimp = require("jimp");

/**
 * Helper to check if a point is inside a polygon (ray casting algorithm)
 */
function isPointInPolygon(point, vs) {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].x,
            yi = vs[i].y;
        const xj = vs[j].x,
            yj = vs[j].y;

        const intersect =
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Creates multiple paths from SVG with proper attribute parsing and geometric nesting detection
 */
function createMultiplePaths(svgContent) {
    try {
        const rawPaths = [];
        const pathRegex = /<path([^>]*)>/g;
        let match;

        while ((match = pathRegex.exec(svgContent)) !== null) {
            const attributes = match[1];

            const getAttr = (name) => {
                const regex = new RegExp(`${name}="([^"]*)"`);
                const result = attributes.match(regex);
                return result ? result[1] : null;
            };

            const d = getAttr("d");
            const fill = getAttr("fill");
            const stroke = getAttr("stroke");
            const strokeWidth = getAttr("stroke-width");
            const fillRule = getAttr("fill-rule");

            if (d) {
                const parts = d.split(/M/g).filter((part) => part.trim().length > 0);

                parts.forEach((part) => {
                    const pathD = "M" + part;
                    const points = pathD.match(/-?\d+(\.\d+)?/g);
                    const polygon = [];

                    if (points) {
                        for (let i = 0; i < points.length; i += 2) {
                            const x = parseFloat(points[i]);
                            const y = parseFloat(points[i + 1]);
                            if (!isNaN(x) && !isNaN(y)) {
                                polygon.push({ x, y });
                            }
                        }
                    }

                    if (polygon.length > 2) {
                        let area = 0;
                        for (let i = 0; i < polygon.length; i++) {
                            const j = (i + 1) % polygon.length;
                            area += polygon[i].x * polygon[j].y;
                            area -= polygon[j].x * polygon[i].y;
                        }
                        const absArea = Math.abs(area / 2);

                        if (absArea > 1) {
                            rawPaths.push({
                                d: pathD,
                                fill: fill || "#000000",
                                stroke: stroke || "none",
                                strokeWidth: strokeWidth || "0",
                                fillRule: fillRule || "nonzero",
                                area: absArea,
                                polygon: polygon,
                                samplePoint: polygon[0],
                            });
                        }
                    }
                });
            }
        }

        if (rawPaths.length === 0) {
            return [{ id: "path-0", d: "", fill: "#000000", stroke: "none", strokeWidth: "0" }];
        }

        rawPaths.sort((a, b) => b.area - a.area);

        const processedPaths = rawPaths.map((path, index) => {
            let depth = 0;
            for (let i = 0; i < index; i++) {
                const parent = rawPaths[i];
                if (isPointInPolygon(path.samplePoint, parent.polygon)) {
                    depth++;
                }
            }
            const isHole = depth % 2 !== 0;

            return {
                id: `path-${index}`,
                d: path.d,
                fill: isHole ? "#FFFFFF" : path.fill,
                stroke: path.stroke,
                strokeWidth: path.strokeWidth,
                fillRule: path.fillRule,
            };
        });

        return processedPaths;
    } catch (error) {
        console.error("Error creating multiple paths:", error);
        return [{ id: "path-0", d: "", fill: "#000000", stroke: "none", strokeWidth: "0" }];
    }
}

/**
 * Extracts colors from image
 */
async function extractColorsFromImage(imagePath, count = 10) {
    try {
        const isSvg = imagePath.toLowerCase().endsWith(".svg");

        if (isSvg) {
            const content = fs.readFileSync(imagePath, "utf8");
            const colors = new Set();
            const fillRegex = /fill="([^"]*)"/g;
            const strokeRegex = /stroke="([^"]*)"/g;
            let match;

            while ((match = fillRegex.exec(content)) !== null) {
                if (match[1] !== "none" && match[1].startsWith("#")) colors.add(match[1]);
                if (colors.size >= count) break;
            }
            while (colors.size < count && (match = strokeRegex.exec(content)) !== null) {
                if (match[1] !== "none" && match[1].startsWith("#")) colors.add(match[1]);
                if (colors.size >= count) break;
            }

            if (colors.size === 0) return ["#000000", "#FFFFFF"];
            return Array.from(colors);
        }

        const image = await Jimp.read(imagePath);
        image.resize(100, Jimp.AUTO);
        const colors = new Set();

        for (let y = 0; y < image.bitmap.height; y += 10) {
            for (let x = 0; x < image.bitmap.width; x += 10) {
                const hex = image.getPixelColor(x, y).toString(16).padStart(8, "0");
                colors.add("#" + hex.substring(0, 6));
                if (colors.size >= count) break;
            }
            if (colors.size >= count) break;
        }

        return Array.from(colors);
    } catch (error) {
        console.error("Error extracting colors:", error);
        return ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF"];
    }
}

/**
 * Creates gradient definitions
 */
function createGradientDefs(colors, isLinear = true) {
    if (!colors || colors.length < 2) return "";
    const stops = colors.map((c, i) => `<stop offset="${(i / (colors.length - 1)) * 100}%" stop-color="${c}" />`).join("");
    return `<defs><linearGradient id="linearGrad" x1="0%" y1="0%" x2="100%" y2="100%">${stops}</linearGradient></defs>`;
}

/**
 * Generates SVG with multiple paths
 */
function generateMultiPathSVG(paths, originalSVG) {
    try {
        const viewBoxMatch = originalSVG.match(/viewBox="([^"]*)"/);
        const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 100 100";

        const widthMatch = originalSVG.match(/width="([^"]*)"/) || originalSVG.match(/width='([^']*)'/);
        const heightMatch = originalSVG.match(/height="([^"]*)"/) || originalSVG.match(/height='([^']*)'/);

        const width = widthMatch ? widthMatch[1] : "100";
        const height = heightMatch ? heightMatch[1] : "100";

        let svgContent = `<svg width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">\n`;

        paths.forEach((path) => {
            const fillRuleAttr = path.fillRule ? ` fill-rule="${path.fillRule}"` : "";
            svgContent += `  <path id="${path.id}" d="${path.d}" fill="${path.fill}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}"${fillRuleAttr}/>\n`;
        });

        svgContent += "</svg>";
        return svgContent;
    } catch (error) {
        console.error("Error generating multi-path SVG:", error);
        return originalSVG;
    }
}

module.exports = {
    createMultiplePaths,
    extractColorsFromImage,
    createGradientDefs,
    generateMultiPathSVG,
};
