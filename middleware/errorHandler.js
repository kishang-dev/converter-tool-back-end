// pdf-parser-api/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined, // Provide stack in development
  });
};

module.exports = errorHandler;
