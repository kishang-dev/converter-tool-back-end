const express = require('express');
const router = express.Router();
const { register, login, getMe, forgotPassword, resetPassword, updateUser } = require('../controllers/authController');
const { googleAuth, googleCallback } = require('../controllers/googleAuthController');
const { protect } = require('../middleware/authMiddleware');
const { imageUpload } = require('../middleware/upload');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);
router.put('/update', protect, imageUpload.single('avatar'), updateUser);

// Google OAuth
router.post('/google', googleAuth);
router.get('/google/callback', googleCallback);

module.exports = router;
