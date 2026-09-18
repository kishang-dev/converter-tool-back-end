const express = require('express');
const {
    getAllBlogs,
    getBlogById,
    createBlog,
    updateBlog,
    deleteBlog,
    uploadBlogImage,
    autoGenerateBlog
} = require('../controllers/blogController');
const { imageUpload } = require('../middleware/upload');

const router = express.Router();

router.post('/upload-image', imageUpload.single('image'), uploadBlogImage);
router.post('/auto-generate', autoGenerateBlog);

router
    .route('/')

    .get(getAllBlogs)
    .post(createBlog); // Optionally, add protect middleware here

router
    .route('/:id')
    .get(getBlogById)
    .put(updateBlog)
    .delete(deleteBlog);

module.exports = router;
