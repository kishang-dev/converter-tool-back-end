const express = require("express");
const { identifyUser } = require("../middleware/authMiddleware");
const {
    createChart,
    getCharts,
    getChartById,
    updateChart,
    deleteChart,
    exportFlowchart,
    generateChartWithAI
} = require("../controllers/chartController");

const router = express.Router();

// The chart API allows both guest users and authenticated users to save charts
router.route("/")
    .post(identifyUser, createChart)
    .get(identifyUser, getCharts);

router.post("/generate-ai", identifyUser, generateChartWithAI);

router.route("/:id")
    .get(identifyUser, getChartById)
    .put(identifyUser, updateChart)
    .delete(identifyUser, deleteChart);

router.route("/:id/export")
    .get(exportFlowchart);

module.exports = router;
