const path = require("path");
const fs = require("fs-extra");
const File = require("../models/File");
const {
    mergePDFs,
    splitPDF,
    compressPDF,
    rotatePDF,
    pdfToWord,
    pdfToExcel,
    pdfToImage,
    protectPDF,
} = require("../utils/pdfUtils");

exports.uploadFiles = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No files uploaded" });
        }

        const fileRecords = await Promise.all(
            req.files.map((file) => {
                return File.create({
                    filename: file.filename,
                    originalName: file.originalname,
                    path: file.path,
                    size: file.size,
                    mimeType: file.mimetype,
                    mimeType: file.mimetype,
                    operation: "upload",
                    user: req.user ? req.user._id : undefined,
                    guestId: req.user ? undefined : req.headers['x-guest-id']
                });
            })
        );

        res.status(200).json({
            success: true,
            message: "Files uploaded successfully",
            files: fileRecords,
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Upload failed", details: error.message });
    }
};

exports.getAllFiles = async (req, res) => {
    try {
        let query = {};
        if (req.user) {
            query = { user: req.user._id };
        } else if (req.headers['x-guest-id']) {
            query = { guestId: req.headers['x-guest-id'] };
        } else {
            return res.json({ success: true, files: [] });
        }

        const files = await File.find(query).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch files", details: error.message });
    }
};

exports.getFileById = async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }
        res.json({ success: true, file });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch file", details: error.message });
    }
};

exports.mergeFiles = async (req, res) => {
    try {
        const { fileIds } = req.body;
        if (!fileIds || fileIds.length < 2) {
            return res.status(400).json({ error: "At least 2 files required for merging" });
        }

        const files = await File.find({ _id: { $in: fileIds } });
        if (files.length !== fileIds.length) {
            return res.status(404).json({ error: "Some files not found" });
        }

        const filePaths = files.map((f) => f.path);
        const outputPath = await mergePDFs(filePaths);

        const mergedFile = await File.create({
            filename: path.basename(outputPath),
            originalName: "merged.pdf",
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/pdf",
            operation: "merge",
            status: "completed",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({
            success: true,
            message: "PDFs merged successfully",
            file: mergedFile,
            downloadUrl: `/outputs/${path.basename(outputPath)}`,
        });
    } catch (error) {
        console.error("Merge error:", error);
        res.status(500).json({ error: "Merge failed", details: error.message });
    }
};

exports.splitFile = async (req, res) => {
    try {
        const { fileId, ranges } = req.body;
        if (!fileId) return res.status(400).json({ error: "File ID required" });

        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPaths = await splitPDF(file.path, ranges);

        const splitFiles = await Promise.all(
            outputPaths.map(async (outputPath) => {
                return await File.create({
                    filename: path.basename(outputPath),
                    originalName: path.basename(outputPath),
                    path: outputPath,
                    size: (await fs.stat(outputPath)).size,
                    mimeType: "application/pdf",
                    operation: "split",
                    status: "completed",
                    user: req.user ? req.user._id : undefined,
                    guestId: req.user ? undefined : req.headers['x-guest-id']
                });
            })
        );

        res.json({
            success: true,
            message: "PDF split successfully",
            files: splitFiles,
        });
    } catch (error) {
        console.error("Split error:", error);
        res.status(500).json({ error: "Split failed", details: error.message });
    }
};

exports.rotateFile = async (req, res) => {
    try {
        const { fileId, degrees } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPath = await rotatePDF(file.path, degrees);
        const rotatedFile = await File.create({
            filename: path.basename(outputPath),
            originalName: "rotated_" + file.originalName,
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/pdf",
            operation: "rotate",
            status: "completed",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({ success: true, message: "PDF rotated", file: rotatedFile });
    } catch (error) {
        res.status(500).json({ error: "Rotate failed", details: error.message });
    }
};

exports.compressFile = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPath = await compressPDF(file.path);
        const compressedFile = await File.create({
            filename: path.basename(outputPath),
            originalName: "compressed_" + file.originalName,
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/pdf",
            operation: "compress",
            status: "completed",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({ success: true, message: "PDF compressed", file: compressedFile });
    } catch (error) {
        res.status(500).json({ error: "Compress failed", details: error.message });
    }
};

exports.convertToImage = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPaths = await pdfToImage(file.path);

        const imageFiles = await Promise.all(
            outputPaths.map(async (outputPath) => {
                return await File.create({
                    filename: path.basename(outputPath),
                    originalName: file.originalName.replace(".pdf", path.extname(outputPath)),
                    path: outputPath,
                    size: (await fs.stat(outputPath)).size,
                    mimeType: "image/png",
                    operation: "convert-image",
                    status: "completed",
                    user: req.user ? req.user._id : undefined,
                    guestId: req.user ? undefined : req.headers['x-guest-id']
                });
            })
        );

        res.json({
            success: true,
            message: "PDF converted to images",
            files: imageFiles,
        });
    } catch (error) {
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.protectFile = async (req, res) => {
    try {
        const { fileId, password } = req.body;
        if (!password) return res.status(400).json({ error: "Password is required" });

        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPath = await protectPDF(file.path, password);
        const protectedFile = await File.create({
            filename: path.basename(outputPath),
            originalName: "protected_" + file.originalName,
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/pdf",
            operation: "protect",
            status: "completed",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({ success: true, message: "PDF protected successfully", file: protectedFile });
    } catch (error) {
        res.status(500).json({ error: "Protection failed", details: error.message });
    }
};

exports.convertToWord = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPath = await pdfToWord(file.path);
        const docxFile = await File.create({
            filename: path.basename(outputPath),
            originalName: file.originalName.replace(".pdf", ".docx"),
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            operation: "convert",
            status: "completed",
        });

        res.json({ success: true, message: "PDF converted to Word", file: docxFile });
    } catch (error) {
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.convertToExcel = async (req, res) => {
    try {
        const { fileId } = req.body;
        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const outputPath = await pdfToExcel(file.path);
        const xlsxFile = await File.create({
            filename: path.basename(outputPath),
            originalName: file.originalName.replace(".pdf", ".xlsx"),
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            operation: "convert",
            status: "completed",
        });

        res.json({ success: true, message: "PDF converted to Excel", file: xlsxFile });
    } catch (error) {
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
};

exports.deleteFile = async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: "File not found" });

        await fs.remove(file.path);
        await File.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Delete failed", details: error.message });
    }
};

exports.editFile = async (req, res) => {
    try {
        const { fileId, pages } = req.body;
        // pages: [{ index: 0, rotation: 0 }, { index: 1, rotation: 90 }]

        if (!fileId || !pages || !Array.isArray(pages)) {
            return res.status(400).json({ error: "Invalid request. fileId and pages array required." });
        }

        const file = await File.findById(fileId);
        if (!file) return res.status(404).json({ error: "File not found" });

        const { assemblePDF } = require("../utils/pdfUtils"); // Late require or ensure it's imported at top
        const outputPath = await assemblePDF(file.path, pages);

        const editedFile = await File.create({
            filename: path.basename(outputPath),
            originalName: "edited_" + file.originalName,
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/pdf",
            operation: "edit",
            status: "completed",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({
            success: true,
            message: "PDF edited successfully",
            file: editedFile,
            downloadUrl: `/outputs/${path.basename(outputPath)}`
        });

    } catch (error) {
        console.error("Edit error:", error);
        res.status(500).json({ error: "Edit failed", details: error.message });
    }
};

exports.getPreviewImages = async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: "File not found" });

        const { pdfToImage } = require("../utils/pdfUtils");
        const imagePaths = await pdfToImage(file.path);

        const imageUrls = imagePaths.map(p => `/outputs/${path.basename(p)}`);

        res.json({ success: true, images: imageUrls });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate previews", details: error.message });
    }
};

exports.getPageText = async (req, res) => {
    try {
        const { id, pageIndex } = req.params;
        const file = await File.findById(id);
        if (!file) return res.status(404).json({ error: "File not found" });

        const { extractPageText } = require("../utils/pdfUtils");
        const textData = await extractPageText(file.path, parseInt(pageIndex));

        res.json({ success: true, data: textData });
    } catch (error) {
        res.status(500).json({ error: "Failed to extract text", details: error.message });
    }
};

exports.savePageContent = async (req, res) => {
    try {
        const { id, pageIndex } = req.params;
        const { modifications } = req.body; // Array of edits

        const file = await File.findById(id);
        if (!file) return res.status(404).json({ error: "File not found" });

        const { modifyPageContent } = require("../utils/pdfUtils");
        const outputPath = await modifyPageContent(file.path, parseInt(pageIndex), modifications);

        // Update DB record to point to new file or create new version
        const newFile = await File.create({
            filename: path.basename(outputPath),
            originalName: "edited_" + file.originalName,
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/pdf",
            operation: "content-edit",
            status: "completed",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({
            success: true,
            message: "Page saved",
            file: newFile,
            downloadUrl: `/outputs/${path.basename(outputPath)}`
        });

    } catch (error) {
        console.error("Content Save Error:", error);
        res.status(500).json({ error: "Failed to save content", details: error.message });
    }
};

exports.addPage = async (req, res) => {
    try {
        const { id } = req.params;
        const file = await File.findById(id);
        if (!file) return res.status(404).json({ error: "File not found" });

        const { addBlankPage } = require("../utils/pdfUtils");
        const outputPath = await addBlankPage(file.path);

        const newFile = await File.create({
            originalName: `added-page-${file.originalName}`,
            filename: path.basename(outputPath),
            path: outputPath,
            size: (await fs.stat(outputPath)).size,
            mimeType: "application/pdf",
            operation: "edit",
            user: req.user ? req.user._id : undefined,
            guestId: req.user ? undefined : req.headers['x-guest-id']
        });

        res.json({
            success: true,
            file: newFile,
        });
    } catch (error) {
        console.error("Add page error:", error);
        res.status(500).json({ error: "Failed to add page" });
    }
};
