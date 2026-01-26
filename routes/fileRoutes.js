const express = require("express");
const router = express.Router();
const fileController = require("../controllers/fileController");
const { pdfUpload } = require("../middleware/upload");

// Upload single or multiple files
router.post("/upload", pdfUpload.array("files", 10), fileController.uploadFiles);

// File management
router.get("/", fileController.getAllFiles);
router.get("/:id", fileController.getFileById);
router.get("/:id/previews", fileController.getPreviewImages);
router.get("/:id/page/:pageIndex/text", fileController.getPageText);
router.post("/:id/page/:pageIndex/save", fileController.savePageContent);
router.delete("/:id", fileController.deleteFile);

// PDF Operations
router.post("/merge", fileController.mergeFiles);
router.post("/split", fileController.splitFile);
router.post("/rotate", fileController.rotateFile);
router.post("/compress", fileController.compressFile);
router.post("/protect", fileController.protectFile);
router.post("/edit", fileController.editFile);
router.post("/:id/add-page", fileController.addPage);

// Conversions
router.post("/to-image", fileController.convertToImage);
router.post("/to-word", fileController.convertToWord);
router.post("/to-excel", fileController.convertToExcel);

module.exports = router;
