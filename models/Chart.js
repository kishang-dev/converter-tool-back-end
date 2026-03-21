const mongoose = require("mongoose");

const chartSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
        guestId: {
            type: String,
            required: false,
        },
        title: {
            type: String,
            default: "Untitled Chart",
        },
        nodes: {
            type: Array,
            default: [],
        },
        edges: {
            type: Array,
            default: [],
        },
        viewport: {
            type: Object,
            default: { x: 0, y: 0, zoom: 1 }
        }
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Chart", chartSchema);
