const fs = require("fs");
const Pdf = require("../models/Pdf");
const { processPDF } = require("../utils/pdfProcessor");

const uploadPdf = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "No PDF file uploaded" });
  }

  try {
    console.log(`Received upload: ${req.file.originalname}`);

    // Pass user/guest info to processPDF or update it after
    const pdfDoc = await processPDF(req.file.path, req.file.originalname);

    // Update ownership
    if (req.user) {
      pdfDoc.user = req.user._id;
    } else if (req.headers['x-guest-id']) {
      pdfDoc.guestId = req.headers['x-guest-id'];
    }
    await pdfDoc.save();

    res.json({
      message: "PDF uploaded and processed successfully with OCR",
      pdfId: pdfDoc._id,
      metadata: {
        fileName: pdfDoc.fileName,
        totalPages: pdfDoc.metadata.totalPages,
        fileSize: pdfDoc.metadata.fileSize,
        processingStatus: pdfDoc.processingStatus,
        hasOcrText: pdfDoc.pages.some(
          (page) => page.ocrText && page.ocrText.trim().length > 0
        ),
      },
    });
  } catch (error) {
    console.error("Upload route error:", error);

    // Clean up uploaded file in case of processing error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`Cleaned up failed upload file: ${req.file.path}`);
      } catch (cleanupError) {
        console.error(
          "Failed to clean up uploaded file on error:",
          cleanupError
        );
      }
    }
    next(error); // Pass error to global error handler
  }
};

const getPdfContent = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id, {
      originalFile: 0, // Exclude original file
      "pages.imageData": 0, // Exclude image data
    });
    if (!pdf) {
      return res.status(404).json({ error: "PDF not found" });
    }

    // Check ownership
    const isOwner = (req.user && pdf.user && pdf.user.toString() === req.user._id.toString()) ||
      (!req.user && pdf.guestId && pdf.guestId === req.headers['x-guest-id']);

    if (!isOwner) {
      return res.status(403).json({ error: "Not authorized to access this file" });
    }

    // Check if any page has OCR text
    const hasOcrText = pdf.pages.some(
      (page) => page.ocrText && page.ocrText.trim().length > 0
    );

    res.json({
      fileName: pdf.fileName,
      textContent: pdf.textContent,
      htmlContent: pdf.htmlContent,
      metadata: pdf.metadata,
      pagesCount: pdf.pages ? pdf.pages.length : 0,
      processingStatus: pdf.processingStatus,
      hasOcrText: hasOcrText,
      pagesSummary: pdf.pages.map((p) => ({
        pageNumber: p.pageNumber,
        contentPreview: p.content
          ? p.content.substring(0, 200) + "..."
          : "No text content.",
        hasImage: !!p.imageData,
        hasOcrText: !!(p.ocrText && p.ocrText.trim().length > 0),
        ocrTextPreview:
          p.ocrText && p.ocrText.trim().length > 0
            ? p.ocrText.substring(0, 100) + "..."
            : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const getPdfPageContent = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ error: "PDF not found" });
    }

    const pageNum = parseInt(req.params.pageNum);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pdf.metadata.totalPages) {
      return res.status(400).json({ error: "Invalid page number" });
    }

    const page = pdf.pages.find((p) => p.pageNumber === pageNum);

    if (!page) {
      return res.status(404).json({
        error: `Page ${pageNum} not found for this PDF in the database.`,
      });
    }

    res.json({
      pageNumber: page.pageNumber,
      content: page.content,
      textItems: page.textItems,
      hasImage: !!page.imageData,
      ocrText: page.ocrText || null,
      hasOcrText: !!(page.ocrText && page.ocrText.trim().length > 0),
    });
  } catch (error) {
    next(error);
  }
};

const getPdfPageImage = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ error: "PDF not found" });
    }

    const pageNum = parseInt(req.params.pageNum);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pdf.metadata.totalPages) {
      return res.status(400).json({ error: "Invalid page number" });
    }

    const page = pdf.pages.find((p) => p.pageNumber === pageNum);

    if (!page || !page.imageData) {
      return res
        .status(404)
        .json({ error: `Page ${pageNum} image not found or not processed.` });
    }

    res.set("Content-Type", "image/png");
    res.send(page.imageData);
  } catch (error) {
    next(error);
  }
};

const getOriginalPdf = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ error: "PDF not found" });
    }
    if (!pdf.originalFile) {
      return res.status(404).json({ error: "Original PDF file not stored." });
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
    });
    res.send(pdf.originalFile);
  } catch (error) {
    next(error);
  }
};

const listAllPdfs = async (req, res, next) => {
  try {
    let query = {};
    if (req.user) {
      query = { user: req.user._id };
    } else if (req.headers['x-guest-id']) {
      query = { guestId: req.headers['x-guest-id'] };
    } else {
      // If neither (should be caught by middleware normally, but safe fallback)
      return res.json([]);
    }

    const pdfs = await Pdf.find(
      query,
      {
        fileName: 1,
        "metadata.totalPages": 1,
        "metadata.fileSize": 1,
        processingStatus: 1,
        createdAt: 1,
        "metadata.title": 1,
        "metadata.author": 1,
        pages: 1,
      }
    ).sort({ createdAt: -1 });

    // Add OCR information to the response
    const pdfsWithOcrInfo = pdfs.map((pdf) => ({
      _id: pdf._id,
      fileName: pdf.fileName,
      metadata: pdf.metadata,
      processingStatus: pdf.processingStatus,
      createdAt: pdf.createdAt,
      hasOcrText: pdf.pages
        ? pdf.pages.some(
          (page) => page.ocrText && page.ocrText.trim().length > 0
        )
        : false,
      ocrPagesCount: pdf.pages
        ? pdf.pages.filter(
          (page) => page.ocrText && page.ocrText.trim().length > 0
        ).length
        : 0,
    }));

    res.json(pdfsWithOcrInfo);
  } catch (error) {
    next(error);
  }
};

const deletePdf = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ error: "PDF not found" });
    }

    // Check ownership
    const isOwner = (req.user && pdf.user && pdf.user.toString() === req.user._id.toString()) ||
      (!req.user && pdf.guestId && pdf.guestId === req.headers['x-guest-id']);

    if (!isOwner) {
      return res.status(403).json({ error: "Not authorized to delete this file" });
    }

    await Pdf.findByIdAndDelete(req.params.id);
    res.json({ message: "PDF deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// New endpoint to get only OCR text from a specific page
const getPdfPageOcrText = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id, {
      pages: 1,
      fileName: 1,
    });

    if (!pdf) {
      return res.status(404).json({ error: "PDF not found" });
    }

    const pageNum = parseInt(req.params.pageNum);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pdf.pages.length) {
      return res.status(400).json({ error: "Invalid page number" });
    }

    const page = pdf.pages.find((p) => p.pageNumber === pageNum);

    if (!page) {
      return res.status(404).json({
        error: `Page ${pageNum} not found for this PDF.`,
      });
    }

    res.json({
      pageNumber: page.pageNumber,
      fileName: pdf.fileName,
      ocrText: page.ocrText || "",
      hasOcrText: !!(page.ocrText && page.ocrText.trim().length > 0),
    });
  } catch (error) {
    next(error);
  }
};

// New endpoint to search within OCR text
const searchInOcrText = async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const searchRegex = new RegExp(query, "i");

    const pdfs = await Pdf.find(
      {
        $or: [{ "pages.ocrText": searchRegex }, { textContent: searchRegex }],
      },
      {
        fileName: 1,
        "metadata.title": 1,
        "metadata.totalPages": 1,
        pages: 1,
      }
    );

    const results = [];

    pdfs.forEach((pdf) => {
      const matchingPages = pdf.pages.filter(
        (page) =>
          (page.ocrText && searchRegex.test(page.ocrText)) ||
          (page.content && searchRegex.test(page.content))
      );

      if (matchingPages.length > 0) {
        results.push({
          pdfId: pdf._id,
          fileName: pdf.fileName,
          title: pdf.metadata.title,
          totalPages: pdf.metadata.totalPages,
          matchingPages: matchingPages.map((page) => ({
            pageNumber: page.pageNumber,
            hasOcrText: !!(page.ocrText && page.ocrText.trim().length > 0),
            excerpt: getSearchExcerpt(
              page.content + " " + (page.ocrText || ""),
              query
            ),
          })),
        });
      }
    });

    res.json({
      query: query,
      totalResults: results.length,
      results: results,
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to get search excerpt
function getSearchExcerpt(text, query, maxLength = 200) {
  if (!text) return "";

  const regex = new RegExp(query, "gi");
  const match = text.match(regex);

  if (!match) return text.substring(0, maxLength) + "...";

  const index = text.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + query.length + 50);

  let excerpt = text.substring(start, end);
  if (start > 0) excerpt = "..." + excerpt;
  if (end < text.length) excerpt = excerpt + "...";

  return excerpt.replace(regex, `<mark>$&</mark>`);
}

module.exports = {
  uploadPdf,
  getPdfContent,
  getPdfPageContent,
  getPdfPageImage,
  getOriginalPdf,
  listAllPdfs,
  deletePdf,
  getPdfPageOcrText,
  searchInOcrText,
};
