const express = require('express');
const router = express.Router();
const {
    parseResume,
    saveResume,
    getUserResumes,
    exportResume,
    getResumeById,
    updateResume,
    deleteResume
} = require('../controllers/resumeController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post('/parse', protect, upload.single('file'), parseResume);
router.post('/', protect, saveResume);
router.get('/', protect, getUserResumes);
router.get('/:id', protect, getResumeById);
router.put('/:id', protect, updateResume);
router.delete('/:id', protect, deleteResume);
router.post('/:id/export', protect, exportResume);

module.exports = router;
