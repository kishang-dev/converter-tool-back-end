const Chart = require("../models/Chart");
const { callAIProvider } = require("../utils/aiProvider");

// @desc    Generate a chart using AI
// @route   POST /api/charts/generate-ai
// @access  Public (Guest/Auth)
exports.generateChartWithAI = async (req, res) => {
    try {
        const { title, prompt, platform, apiKey, chartType = "Flowchart", guestId: bodyGuestId } = req.body;
        let userId = req.user ? req.user._id : null;
        let guestId = req.headers["x-guest-id"] || bodyGuestId;

        if (!userId && !guestId) {
            guestId = "anonymous-" + Date.now();
        }

        if (!prompt || !platform || !apiKey) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        const systemPrompt = `
Act like a senior AI Diagram Architect, systems designer, and logic analyst with deep expertise in process modeling, BPMN, UML, and structured JSON generation.

Your goal is to transform a user's project description into a highly detailed, professional, and production-ready ${chartType} represented as a strictly valid JSON object.

DIAGRAM TYPE SPECIFIC RULES:
- Flowchart: Standard logic flow (Process, Decision, Input/Output).
- Process Flow Diagram (PFD): Focus on industrial process streams, equipment, and flow.
- Workflow Diagram: Focus on business tasks, sequence, and performers.
- Swimlane Diagram: Organize nodes into horizontal or vertical lanes by role/department (use 'x' or 'y' positions carefully to denote lanes).
- BPMN Diagram: Use standard BPMN elements (Events, Gateways, Activities).
- Data Flow Diagram (DFD): Focus on how data moves through a system (External Entities, Processes, Data Stores).
- Decision Tree: A tree-like model of decisions and their possible consequences.
- Algorithm Flowchart: High-level programming logic (Loops, Conditions, Assignments).
- System Flowchart: How data flows through a physical or virtual system.
- Cross-functional Flowchart: Similar to Swimlane, showing relationship between a process and the functional units.

REQUIREMENTS:
1. Decompose the logic into 8–15 granular, meaningful steps relevant to a ${chartType}.
2. Use precise, action-oriented labels (e.g., "Validate Input Data", "Store Record in Database", "Handle Authentication Failure").
3. Ensure every decision node (diamond or gateway) includes exactly two clearly labeled outgoing edges (e.g., Yes/No, Valid/Invalid, Success/Failure).
4. Maintain a clean hierarchical layout (top-to-bottom or left-to-right) with a minimum spacing of 300px between nodes.
5. Apply correct semantic shapes strictly:
   - roundedRect → Start / End / Process
   - diamond      → Decision / Gateway
   - cylinder     → Database / Data Store
   - parallelogram → Input / Output / External Entity
   - document     → Reports / Exports / Documents
   - circle       → Trigger / Connection / Event

COLOR SYSTEM (apply exactly):
   - Process/Activity: #3b82f6  (Vibrant Blue)
   - Start/Success/Event: #10b981  (Emerald Green)
   - Decision/Gateway: #f59e0b  (Amber Orange)
   - Error/Failure: #ef4444  (Rose Red)
   - Data/DB/Store: #8b5cf6  (Violet Purple)

STRICT NODE SCHEMA:
{
  "id": "node_1",
  "type": "shape_type",
  "position": { "x": number, "y": number },
  "data": {
    "label": "Action Text",
    "backgroundColor": "#hex",
    "borderColor": "#334155",
    "textColor": "#ffffff"
  }
}

STRICT EDGE SCHEMA:
{
  "id": "edge_1_2",
  "source": "node_1",
  "target": "node_2",
  "label": "Yes / No / Result",
  "animated": true
}

CONSTRAINTS:
- Output ONLY a valid, parsable JSON object — no explanations, no markdown, no code fences.
- The JSON must contain exactly two top-level keys: "nodes" and "edges".
- Every node must be connected; no orphaned nodes.
- Ensure logical continuity and layout consistency throughout.

Take a deep breath and work through this step-by-step for a ${chartType}.
`;

        const userPrompt = `
Project Name: ${title}
Diagram Type: ${chartType}
Logic to Map: ${prompt}

Task: Analyze the project name and logic above, then generate a complete, professional ${chartType} JSON.

Checklist:
1. Break the flow into 8–15 detailed, logical steps covering the full lifecycle of this ${chartType}.
2. Ensure decision/gateway nodes have labeled outgoing paths.
3. Nodes must follow the semantic shape and color rules defined in your instructions.
4. Layout must be sequential and non-overlapping (min 300px spacing between nodes).
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
            title: title || `AI Generated ${chartType}`,
            chartType: chartType,
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
        const { title, nodes, edges, viewport, chartType = "Flowchart" } = req.body;
        let userId = req.user ? req.user._id : null;
        let guestId = req.headers["x-guest-id"] || req.body.guestId;

        if (!userId && !guestId) {
            guestId = "anonymous-" + Date.now();
        }

        const chart = new Chart({
            userId,
            guestId,
            title: title || "Untitled Chart",
            chartType: chartType,
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
        const { title, nodes, edges, viewport, chartType } = req.body;
        let chart = await Chart.findById(req.params.id);

        if (!chart) {
            return res.status(404).json({ success: false, error: "Chart not found" });
        }

        if (title !== undefined) chart.title = title;
        if (nodes !== undefined) chart.nodes = nodes;
        if (edges !== undefined) chart.edges = edges;
        if (viewport !== undefined) chart.viewport = viewport;
        if (chartType !== undefined) chart.chartType = chartType;

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
