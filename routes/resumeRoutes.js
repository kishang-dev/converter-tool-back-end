const express = require('express');
const router = express.Router();
const {
    parseResume,
    saveResume,
    getUserResumes,
    exportResume
} = require('../controllers/resumeController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post('/parse', protect, upload.single('file'), parseResume);
router.post('/', protect, saveResume);
router.get('/', protect, getUserResumes);
router.post('/:id/export', protect, exportResume);

module.exports = router;
