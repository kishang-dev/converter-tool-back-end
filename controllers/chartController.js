const Chart = require("../models/Chart");
const { callAIProvider } = require("../utils/aiProvider");

// @desc    Generate a chart using AI
// @route   POST /api/charts/generate-ai
// @access  Public (Guest/Auth)
exports.generateChartWithAI = async (req, res) => {
    try {
        const { title, prompt, platform, apiKey, guestId: bodyGuestId } = req.body;
        let userId = req.user ? req.user._id : null;
        let guestId = req.headers["x-guest-id"] || bodyGuestId;

        if (!userId && !guestId) {
            guestId = "anonymous-" + Date.now();
        }

        if (!prompt || !platform || !apiKey) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        const systemPrompt = `
You are an expert AI Flowchart Architect and logic analyst.
Your goal is to transform a user's description into a high-quality, professional, and comprehensive flowchart.

STRICT OUTPUT RULE:
- Return ONLY a valid, parsable JSON object.
- NO conversion text, NO markdown, NO \`\`\`json tags.
- The JSON must have "nodes" and "edges" arrays.

CORE PRINCIPLES:
1. DEEP DETAIL: Do not just map the surface logic. Break down the request into 8-15 granular steps. Include authentication, validation, processing, and error handling paths.
2. HIERARCHICAL LAYOUT: Arrange nodes in a clear, sequential order (Top-to-Bottom or Left-to-Right). Maintain a minimum distance of 300px between nodes to avoid clutter.
3. DESCRIPTIVE LABELS: Use action-oriented, professional labels (e.g., "Verify User Credentials" instead of just "Login").
4. SEMANTIC SHAPES (STRICT):
   - roundedRect: Process steps or Start/End.
   - diamond: Decision points (always include Yes/No paths).
   - cylinder: Database/Data Storage.
   - parallelogram: User Input or Output data.
   - document: Reports, Exports, or physical documents.
   - circle: Trigger events or small connectors.

COLOR SYSTEM:
- Processes: #3b82f6 (Vibrant Blue)
- Success/Start/End: #10b981 (Emerald Green)
- Decisions/Pending: #f59e0b (Amber Orange)
- Errors/Stop: #ef4444 (Rose Red)
- Data/DB: #8b5cf6 (Violet Purple)

STRICT NODE FORMAT:
{
  "id": "node_1",
  "type": "shape_type",
  "position": { "x": number, "y": number },
  "data": { "label": "Action Text", "backgroundColor": "#hex", "borderColor": "#334155", "textColor": "#ffffff" }
}

STRICT EDGE FORMAT:
{
  "id": "edge_1_2",
  "source": "node_1",
  "target": "node_2",
  "label": "Action/Result",
  "animated": true
}
`;

        const userPrompt = `
Project Name: ${title}
Logic to Map: ${prompt}

Task: Create a highly detailed and professional flowchart for the logic specified above.
1. Break the flow into 8-15 detailed, logical steps.
2. Ensure every decision point (diamond) has clear outcome paths.
3. Layout the nodes in a clean, non-overlapping sequential hierarchy.
4. Ensure labels are professional and provide clear context.
`;

        const aiResponse = await callAIProvider({
            platform,
            apiKey,
            prompt: userPrompt,
            systemPrompt
        });

        if (!aiResponse.nodes || !aiResponse.edges || !Array.isArray(aiResponse.nodes) || !Array.isArray(aiResponse.edges)) {
            throw new Error("Invalid response format from AI. Cannot parse nodes and edges.");
        }

        // Validate and clean edges
        const validNodeIds = new Set(aiResponse.nodes.map(n => n.id));
        const cleanEdges = aiResponse.edges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

        // Layout Guard: Ensure nodes aren't stacked on top of each other
        const seenPositions = new Set();
        aiResponse.nodes.forEach((node, index) => {
            if (!node.position) node.position = { x: index * 300, y: 0 };

            // Round to a 50px grid to detect "near" overlaps
            const gridX = Math.round(node.position.x / 50);
            const gridY = Math.round(node.position.y / 50);
            const posKey = `${gridX},${gridY}`;

            if (seenPositions.has(posKey)) {
                // Shift if overlapping
                node.position.x += 350;
                node.position.y += 0;
            }
            seenPositions.add(`${Math.round(node.position.x / 50)},${Math.round(node.position.y / 50)}`);
        });

        const chart = new Chart({
            userId,
            guestId,
            title: title || "AI Generated Chart",
            nodes: aiResponse.nodes,
            edges: cleanEdges,
            viewport: { x: 0, y: 0, zoom: 1 }
        });

        await chart.save();

        res.status(201).json({
            success: true,
            chart,
        });
    } catch (error) {
        console.error("AI Chart Generation Error:", error.message);
        res.status(500).json({ success: false, error: error.message || "Failed to generate chart with AI" });
    }
};

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
