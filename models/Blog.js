const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    excerpt: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    },
    readTime: {
        type: String,
        default: '5 min read'
    },
    category: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    author: {
        type: String,
        default: 'ToolBasket Team'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Blog', blogSchema);
