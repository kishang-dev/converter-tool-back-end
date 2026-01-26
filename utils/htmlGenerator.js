// pdf-parser-api/utils/htmlGenerator.js
const { escapeHtml } = require("./helpers");

function inferLineAlignment(lineItems, pageWidth) {
  if (!lineItems || lineItems.length === 0 || !pageWidth) return "left";

  let minX = Infinity;
  let maxX = -Infinity;
  lineItems.forEach((item) => {
    minX = Math.min(minX, item.x);
    maxX = Math.max(maxX, item.x + item.width);
  });

  if (isNaN(maxX) || maxX === -Infinity) {
    maxX = -Infinity;
    lineItems.forEach((item) => {
      maxX = Math.max(maxX, item.x + item.str.length * (item.height * 0.6));
    });
  }

  const tolerance = pageWidth * 0.05;

  const isLeftAligned = minX < tolerance;
  const isRightAligned = pageWidth - maxX < tolerance;
  const isCentered = Math.abs((minX + maxX) / 2 - pageWidth / 2) < tolerance;

  if (isCentered && !isLeftAligned && !isRightAligned) {
    return "center";
  } else if (isRightAligned && !isLeftAligned) {
    return "right";
  } else {
    return "left";
  }
}

function processLineBuffer(lineItems, inferredAlignment) {
  let lineHtml = `<div style="display: flex; text-align: ${inferredAlignment}; width: 100%; flex-wrap: wrap; align-items: baseline;">`;

  lineItems.sort((a, b) => a.x - b.x);

  lineItems.forEach((item, index) => {
    const text = escapeHtml(item.str);

    let styles = `font-size: ${item.height}px;`;
    let fontWeight = "normal";
    let fontStyle = "normal";

    if (item.fontName) {
      if (item.fontName.toLowerCase().includes("bold")) {
        fontWeight = "bold";
      }
      if (item.fontName.toLowerCase().includes("italic")) {
        fontStyle = "italic";
      }
    }
    styles += `font-weight: ${fontWeight}; font-style: ${fontStyle};`;

    const isSerif =
      item.fontName && item.fontName.toLowerCase().includes("serif");
    styles += `font-family: ${isSerif ? "serif" : "sans-serif"};`;

    if (index > 0) {
      const currentItemXStart = item.x;
      const previousItem = lineItems[index - 1];
      const previousItemEstimatedWidth =
        previousItem.width ||
        previousItem.str.length * (previousItem.height * 0.6);
      const effectivePreviousItemXEnd =
        previousItem.x + previousItemEstimatedWidth;

      const gap = currentItemXStart - effectivePreviousItemXEnd;

      if (gap > item.height * 0.5) {
        styles += `margin-left: ${gap}px;`;
      } else if (gap > 0) {
        lineHtml += " ";
      }
    }

    lineHtml += `<span style="${styles}">${text}</span>`;
  });

  lineHtml += "</div>";
  return lineHtml;
}

function generateHTMLContent(pdfExtractData, metadata) {
  let htmlContent = '<div class="pdf-document-content">';

  if (metadata.title) {
    htmlContent += `<h1>${escapeHtml(metadata.title)}</h1>`;
  }
  if (metadata.author) {
    htmlContent += `<h2>Author: ${escapeHtml(metadata.author)}</h2>`;
  }
  if (metadata.creationDate) {
    htmlContent += `<p><em>Created: ${metadata.creationDate.toLocaleDateString()}</em></p>`;
  }
  htmlContent += "<hr>";

  const firstPage =
    pdfExtractData && pdfExtractData.pages && pdfExtractData.pages.length > 0
      ? pdfExtractData.pages[0]
      : null;
  const pageWidth = firstPage ? firstPage.width : 800;

  if (pdfExtractData && pdfExtractData.pages) {
    pdfExtractData.pages.forEach((page) => {
      htmlContent += `<div class="pdf-page">`;
      htmlContent += `<h3>Page ${page.pageNumber}</h3>`;

      const sortedTextItems = [...page.content].sort((a, b) => {
        if (Math.abs(a.y - b.y) < 2) {
          return a.x - b.x;
        }
        return a.y - b.y;
      });

      let currentLineY = -1;
      let lineBuffer = [];

      sortedTextItems.forEach((item, index) => {
        if (
          currentLineY === -1 ||
          Math.abs(item.y - currentLineY) > item.height * 0.75
        ) {
          if (lineBuffer.length > 0) {
            const inferredAlignment = inferLineAlignment(lineBuffer, pageWidth);
            htmlContent += processLineBuffer(lineBuffer, inferredAlignment);
          }
          lineBuffer = [item];
          currentLineY = item.y;
        } else {
          lineBuffer.push(item);
        }

        if (index === sortedTextItems.length - 1 && lineBuffer.length > 0) {
          const inferredAlignment = inferLineAlignment(lineBuffer, pageWidth);
          htmlContent += processLineBuffer(lineBuffer, inferredAlignment);
        }
      });

      htmlContent += `</div>`;
    });
  } else {
    htmlContent += `<p>Detailed HTML content could not be generated. Displaying plain text:</p>`;
    htmlContent += `<pre>${escapeHtml(
      pdfExtractData.text || metadata.textContent || "No content."
    )}</pre>`;
  }

  htmlContent += "</div>";
  return htmlContent;
}

module.exports = {
  generateHTMLContent,
  inferLineAlignment,
  processLineBuffer,
};
