const jwt = require('jsonwebtoken');
const User = require('../models/User');
const GuestUsage = require('../models/GuestUsage');

// Protect routes - Verify JWT
exports.protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    // If no token, we just set req.user to null and continue.
    // The specific route handlers or subsequent middleware will decide if they need a strict login or just guest access.
    // HOWEVER, for `protect` usually means "Login Required".
    // But for our "Free Trial" logic, we might need a "optionalAuth" or handle it in `checkUsage`.

    // Let's make `protect` strictly for User routes, and `checkUsage` handle the hybrid logic.
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id);
            next();
        } catch (err) {
            return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
        }
    } else {
        // If no token is passed to a "protect" middleware, it fails.
        // But we will use `checkUsage` which can handle both.
        res.status(401).json({ success: false, error: 'Not authorized to access this route' });
    }
};

// Check Usage - Handles Free Trial vs Logged In
exports.checkUsage = async (req, res, next) => {
    let token;
    let user = null;

    console.log("CheckUsage Middleware:");
    console.log("Headers:", req.headers);

    // 1. Check if user is logged in
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            user = await User.findById(decoded.id);
            req.user = user;
            console.log("User verified:", user ? user.email : "User not found in DB");
        } catch (error) {
            // Token invalid, treat as guest
            console.log("Token invalid in checkUsage:", error.message);
        }
    } else {
        console.log("No Authorization header found");
    }

    // 2. If User is logged in, they have unlimited access (or based on plan, but for now assuming unlimited)
    if (user) {
        return next();
    }

    // 3. If Guest, check Free Trial
    const guestId = req.headers['x-guest-id'];
    console.log("Guest ID provided:", guestId);

    if (!guestId) {
        return res.status(400).json({
            success: false,
            error: 'Guest ID header (X-Guest-ID) is missing. Please refresh the page.'
        });
    }

    try {
        let guestUsage = await GuestUsage.findOne({ guestId });

        if (!guestUsage) {
            guestUsage = await GuestUsage.create({ guestId, ip: req.ip, usageCount: 0 });
        }

        // Configurable free limit (increased to 5 for smoother user journey/testing)
        const FREE_LIMIT = 5;

        if (guestUsage.usageCount >= FREE_LIMIT) {
            return res.status(403).json({
                success: false,
                error: 'Free trial expired. Please login or register to continue.',
                requiresLogin: true
            });
        }

        // Increment usage
        guestUsage.usageCount += 1;
        guestUsage.lastUsedAt = Date.now();
        await guestUsage.save();

        next();
    } catch (error) {
        console.error("Guest Usage Error:", error);
        res.status(500).json({ success: false, error: 'Server Error checking guest usage' });
    }
};

// Identify User - Decodes token if present, but doesn't strictly require it or check usage limits
exports.identifyUser = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id);
        } catch (error) {
            console.log("Token invalid in identifyUser:", error.message);
        }
    }
    next();
};
