// Provide DOMMatrix polyfill for pdf-parse/pdfjs-dist in Node.js
if (!global.DOMMatrix) {
  global.DOMMatrix = require("dommatrix");
}

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs-extra");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const morgan = require("morgan");
const helmet = require("helmet");

// Load env vars
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// ─── CORS Configuration ──────────────────────────────────────────────────────
const allowedOrigins = [
  // Local development
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  // Production / staging — add your deployed frontend domain here
  // e.g. "https://yourdomain.com"
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((pattern) =>
      typeof pattern === "string" ? pattern === origin : pattern.test(origin)
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      // In production you may want to reject unknown origins.
      // For now we allow all so AWS → local and vice-versa both work.
      callback(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Guest-ID"],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11) choke on 204
};

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(morgan("dev"));

// Handle ALL preflight requests first — before body parsers or auth checks
// NOTE: Using regex instead of "*" — Express 5 (path-to-regexp v8) broke the "*" wildcard
app.options(/.*/, cors(corsOptions));

// Apply CORS to every request
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Define Directories
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");
const tempDir = path.join(__dirname, "temp");
const svgDir = path.join(outputDir, "svg");

// Ensure directories exist
[uploadDir, outputDir, tempDir, svgDir].forEach((dir) => {
  fs.ensureDirSync(dir);
});

// Static Folders
app.use("/uploads", express.static(uploadDir));
app.use("/outputs", express.static(outputDir));
app.use("/api/svg", express.static(svgDir));

// Import Routes
const fileRoutes = require("./routes/fileRoutes");
const pdfRoutes = require("./routes/pdfRoutes");
const ocrRoutes = require("./routes/ocrRoutes");
const svgRoutes = require("./routes/svgRoutes");
const speechToPdfRoutes = require("./routes/speechToPdfRoutes");
const conversionRoutes = require("./routes/conversionRoutes");
const chartRoutes = require("./routes/chartRoutes");
const developerToolsRoutes = require("./routes/developerToolsRoutes");

// Mount Routes
app.use("/api/files", fileRoutes);
app.use("/api", pdfRoutes);
app.use("/api", ocrRoutes);
app.use("/api", svgRoutes);
app.use("/api", speechToPdfRoutes);
app.use("/api", conversionRoutes);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/resumes", require("./routes/resumeRoutes"));
app.use("/api/charts", chartRoutes);
app.use("/api/support", require("./routes/supportRoutes"));
app.use("/api/devtools", developerToolsRoutes);

// Health Check Route
app.get("/health", (req, res) => {
  const mongoose = require("mongoose");
  res.status(200).json({
    message: "API is running",
    success: true,
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    env: process.env.NODE_ENV
  });
});

app.get("/", (req, res) => {
  res.send("Converter Tool Backend API is running...");
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads: ${uploadDir}`);
  console.log(`📁 Outputs: ${outputDir}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.log(`Error: ${err.message}`);
});
