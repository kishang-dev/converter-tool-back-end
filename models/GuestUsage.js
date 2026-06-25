const mongoose = require('mongoose');

const guestUsageSchema = new mongoose.Schema({
    guestId: {
        type: String,
        required: true,
        unique: true
    },
    ip: {
        type: String
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('GuestUsage', guestUsageSchema);
