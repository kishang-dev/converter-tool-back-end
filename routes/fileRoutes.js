const express = require("express");
const router = express.Router();
const fileController = require("../controllers/fileController");
const { documentUpload } = require("../middleware/upload");
const { checkUsage, identifyUser } = require("../middleware/authMiddleware");

// Upload single or multiple files
router.post("/upload", checkUsage, documentUpload.array("files", 10), fileController.uploadFiles);

// File management
router.get("/", identifyUser, fileController.getAllFiles);
router.get("/:id", fileController.getFileById);
router.get("/:id/previews", fileController.getPreviewImages);
router.get("/:id/page/:pageIndex/text", fileController.getPageText);
router.post("/:id/page/:pageIndex/save", checkUsage, fileController.savePageContent);
router.delete("/:id", fileController.deleteFile);

// PDF Operations
router.post("/merge", checkUsage, fileController.mergeFiles);
router.post("/split", checkUsage, fileController.splitFile);
router.post("/rotate", checkUsage, fileController.rotateFile);
router.post("/compress", checkUsage, fileController.compressFile);
router.post("/protect", checkUsage, fileController.protectFile);
router.post("/unlock", checkUsage, fileController.unlockFile);
router.post("/edit", checkUsage, fileController.editFile);
router.post("/:id/add-page", checkUsage, fileController.addPage);

// Conversions
router.post("/to-image", checkUsage, fileController.convertToImage);
router.post("/to-word", checkUsage, fileController.convertToWord);
router.post("/to-excel", checkUsage, fileController.convertToExcel);

module.exports = router;
