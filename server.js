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

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
  origin: process.env.FRONTEND_URL || "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204
};
const allowedOrigins = [
  "https://rad-twilight-1dd94f.netlify.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
}));
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

// Mount Routes
app.use("/api/files", fileRoutes);
app.use("/api", pdfRoutes);
app.use("/api", ocrRoutes);
app.use("/api", svgRoutes);
app.use("/api", speechToPdfRoutes);

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
