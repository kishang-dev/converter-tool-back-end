const Blog = require('../models/Blog');

// @desc    Get all blogs
// @route   GET /api/blogs
exports.getAllBlogs = async (req, res, next) => {
    try {
        const blogs = await Blog.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: blogs.length, data: blogs });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single blog by ID or Slug
// @route   GET /api/blogs/:id
exports.getBlogById = async (req, res, next) => {
    try {
        let blog = await Blog.findById(req.params.id).catch(() => null);
        if (!blog) {
            blog = await Blog.findOne({ slug: req.params.id });
        }
        
        if (!blog) {
            return res.status(404).json({ success: false, error: 'Blog not found' });
        }

        res.status(200).json({ success: true, data: blog });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new blog
// @route   POST /api/blogs
exports.createBlog = async (req, res, next) => {
    try {
        const blog = await Blog.create(req.body);
        res.status(201).json({ success: true, data: blog });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Slug must be unique' });
        }
        next(error);
    }
};

// @desc    Update blog
// @route   PUT /api/blogs/:id
exports.updateBlog = async (req, res, next) => {
    try {
        const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!blog) {
            return res.status(404).json({ success: false, error: 'Blog not found' });
        }

        res.status(200).json({ success: true, data: blog });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete blog
// @route   DELETE /api/blogs/:id
exports.deleteBlog = async (req, res, next) => {
    try {
        const blog = await Blog.findByIdAndDelete(req.params.id);

        if (!blog) {
            return res.status(404).json({ success: false, error: 'Blog not found' });
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

// @desc    Upload blog image
// @route   POST /api/blogs/upload-image
exports.uploadBlogImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please upload a file' });
        }
        
        // Return full URL assuming uploads are served statically via /uploads
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        // Ensure no double slash if URL doesn't have /api
        const baseUrl = API_BASE_URL.replace('/api', ''); 
        
        const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;
        
        res.status(200).json({ success: true, url: imageUrl });
    } catch (error) {
        next(error);
    }
};
