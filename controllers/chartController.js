const Chart = require("../models/Chart");

// @desc    Create a new chart
// @route   POST /api/charts
// @access  Public (Guest/Auth)
exports.createChart = async (req, res) => {
    try {
        const { title, nodes, edges, viewport } = req.body;
        let userId = req.user ? req.user._id : null;
        let guestId = req.headers["x-guest-id"] || req.body.guestId;

        if (!userId && !guestId) {
            guestId = "anonymous-" + Date.now();
        }

        const chart = new Chart({
            userId,
            guestId,
            title: title || "Untitled Chart",
            nodes: nodes || [],
            edges: edges || [],
            viewport: viewport || { x: 0, y: 0, zoom: 1 }
        });

        await chart.save();

        res.status(201).json({
            success: true,
            chart,
        });
    } catch (error) {
        console.error("Error creating chart:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
};

// @desc    Get all charts for current user
// @route   GET /api/charts
// @access  Public (Guest/Auth)
exports.getCharts = async (req, res) => {
    try {
        let query = {};
        if (req.user) {
            query.userId = req.user._id;
        } else {
            const guestId = req.headers["x-guest-id"] || req.query.guestId;
            if (guestId) {
                query.guestId = guestId;
            } else {
                return res.status(200).json({ success: true, charts: [] });
            }
        }

        const charts = await Chart.find(query).sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            charts,
        });
    } catch (error) {
        console.error("Error fetching charts:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
};

// @desc    Get chart by ID
// @route   GET /api/charts/:id
// @access  Public (Guest/Auth)
exports.getChartById = async (req, res) => {
    try {
        const chart = await Chart.findById(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, error: "Chart not found" });
        }
        res.status(200).json({
            success: true,
            chart,
        });
    } catch (error) {
        console.error("Error fetching chart by id:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
};

// @desc    Update chart by ID
// @route   PUT /api/charts/:id
// @access  Public (Guest/Auth)
exports.updateChart = async (req, res) => {
    try {
        const { title, nodes, edges, viewport } = req.body;
        let chart = await Chart.findById(req.params.id);

        if (!chart) {
            return res.status(404).json({ success: false, error: "Chart not found" });
        }

        if (title !== undefined) chart.title = title;
        if (nodes !== undefined) chart.nodes = nodes;
        if (edges !== undefined) chart.edges = edges;
        if (viewport !== undefined) chart.viewport = viewport;

        await chart.save();

        res.status(200).json({
            success: true,
            chart,
        });
    } catch (error) {
        console.error("Error updating chart:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
};

// @desc    Delete chart by ID
// @route   DELETE /api/charts/:id
// @access  Public (Guest/Auth)
exports.deleteChart = async (req, res) => {
    try {
        const chart = await Chart.findById(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, error: "Chart not found" });
        }

        await chart.deleteOne();

        res.status(200).json({
            success: true,
            message: "Chart deleted",
        });
    } catch (error) {
        console.error("Error deleting chart:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
};

// @desc    Export Flowchart (for backward compat in ChartEditor)
// @route   GET /api/charts/:id/export
// @access  Public
exports.exportFlowchart = async (req, res) => {
    try {
        const chart = await Chart.findById(req.params.id);
        if (!chart) {
            return res.status(404).json({ success: false, error: "Chart not found" });
        }

        // Set headers for download
        res.setHeader('Content-disposition', `attachment; filename=flowchart-${chart._id}.json`);
        res.setHeader('Content-type', 'application/json');

        const result = {
            title: chart.title,
            nodes: chart.nodes,
            edges: chart.edges,
            viewport: chart.viewport
        };

        res.send(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error exporting chart:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
};
