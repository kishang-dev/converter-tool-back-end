const express = require('express');
const router = express.Router();
const { register, login, getMe, forgotPassword, resetPassword, updateUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { imageUpload } = require('../middleware/upload');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);
router.put('/update', protect, imageUpload.single('avatar'), updateUser);

module.exports = router;
