const PDFDocument = require("pdfkit");
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

/**
 * @desc    Generate PDF from text
 * @route   POST /api/speech-to-pdf/generate
 * @access  Public
 */
exports.generatePdfFromText = async (req, res, next) => {
    try {
        const { text, title = "Speech to Text Export" } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                message: "Please provide text content",
            });
        }

        const fileName = `speech_${crypto.randomUUID()}.pdf`;
        const outputPath = path.join(__dirname, "../outputs", fileName);

        // Ensure outputs directory exists
        await fs.ensureDir(path.join(__dirname, "../outputs"));

        const doc = new PDFDocument({
            margin: 50,
            size: "A4",
        });

        // Pipe its output somewhere, like to a file or HTTP response
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Add content to the document
        doc
            .fontSize(20)
            .font("Helvetica-Bold")
            .text(title, { align: "center" })
            .moveDown();

        doc
            .fontSize(12)
            .font("Helvetica")
            .text(`Generated on: ${new Date().toLocaleString()}`, { align: "right" })
            .moveDown(2);

        doc
            .fontSize(14)
            .font("Helvetica")
            .text(text, {
                align: "justify",
                lineGap: 5,
            });

        // Finalize PDF file
        doc.end();

        // Wait for the stream to finish writing
        stream.on("finish", () => {
            const protocol = req.protocol;
            const host = req.get("host");
            const downloadUrl = `${protocol}://${host}/outputs/${fileName}`;

            res.status(200).json({
                success: true,
                data: {
                    fileName,
                    downloadUrl,
                },
            });
        });

        stream.on("error", (err) => {
            console.error("Stream error:", err);
            res.status(500).json({
                success: false,
                message: "Error writing PDF file",
            });
        });
    } catch (error) {
        next(error);
    }
};
