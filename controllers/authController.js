const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        console.log("register", req.body)
        // Check if user exists
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ success: false, error: 'User already exists' });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password,
        });

        if (user) {
            res.status(201).json({
                success: true,
                _id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                token: generateToken(user.id),
            });
        } else {
            res.status(400).json({ success: false, error: 'Invalid user data' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check for user email
        const user = await User.findOne({ email }).select('+password');

        if (user && (await user.matchPassword(password))) {
            res.json({
                success: true,
                _id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                token: generateToken(user.id),
            });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error("Login Error:", error.message);
        console.error("Login Error Stack:", error.stack?.split('\n')[1]);
        if (error.message && error.message.includes('buffering timed out')) {
            return res.status(503).json({ success: false, error: 'Database is connecting, please try again in a moment.' });
        }
        res.status(500).json({ success: false, error: 'Database is offline or Server Error' });
    }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Forgot password
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });

        if (!user) {
            return res.status(404).json({ success: false, error: 'There is no user with that email' });
        }

        // Get reset token
        const resetToken = user.getResetPasswordToken();

        await user.save({ validateBeforeSave: false });

        // Point to the frontend reset page (not the API endpoint)
        const frontendUrl = process.env.FRONTEND_URL || 'https://toolbasketai.com';
        const resetUrl = `${frontendUrl}/auth/reset-password/${resetToken}`;

        const htmlEmail = `
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
                    <tr><td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                            <!-- Header -->
                            <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px 40px;text-align:center;">
                                <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">🧺 ToolBasket</h1>
                                <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Your All-in-One Document Toolkit</p>
                            </td></tr>
                            <!-- Body -->
                            <tr><td style="padding:40px;">
                                <h2 style="margin:0 0 16px;color:#1e1e2e;font-size:22px;">Reset Your Password</h2>
                                <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">
                                    We received a request to reset the password for your ToolBasket account associated with <strong>${user.email}</strong>.
                                    Click the button below to set a new password.
                                </p>
                                <div style="text-align:center;margin:32px 0;">
                                    <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.3px;">
                                        Reset Password →
                                    </a>
                                </div>
                                <p style="color:#888;font-size:13px;line-height:1.6;margin:24px 0 0;">
                                    This link will expire in <strong>10 minutes</strong>. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.
                                </p>
                                <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
                                <p style="color:#aaa;font-size:12px;margin:0;">
                                    If the button above doesn't work, copy and paste this URL into your browser:<br>
                                    <a href="${resetUrl}" style="color:#4f46e5;word-break:break-all;">${resetUrl}</a>
                                </p>
                            </td></tr>
                            <!-- Footer -->
                            <tr><td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
                                <p style="color:#bbb;font-size:12px;margin:0;">© ${new Date().getFullYear()} ToolBasket · <a href="${frontendUrl}" style="color:#4f46e5;text-decoration:none;">toolbasketai.com</a></p>
                            </td></tr>
                        </table>
                    </td></tr>
                </table>
            </body>
            </html>
        `;

        try {
            await sendEmail({
                email: user.email,
                subject: 'ToolBasket — Reset Your Password',
                message: `You requested a password reset. Visit this link to reset your password (expires in 10 minutes): ${resetUrl}`,
                html: htmlEmail,
            });

            res.status(200).json({ success: true, data: 'Password reset email sent' });
        } catch (err) {
            console.error('[forgotPassword] Email send error:', err);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;

            await user.save({ validateBeforeSave: false });

            return res.status(500).json({ success: false, error: 'Email could not be sent. Please try again.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = async (req, res) => {
    try {
        // Get hashed token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resettoken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid token' });
        }

        // Set new password
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            token: generateToken(user._id),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/update
// @access  Private
exports.updateUser = async (req, res) => {
    try {
        const { name, phone } = req.body;
        
        // Find user
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Update fields
        if (name) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (req.file) {
            user.avatar = `/uploads/${req.file.filename}`;
        }

        await user.save();

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ success: false, error: 'Server Error: ' + error.message });
    }
};
