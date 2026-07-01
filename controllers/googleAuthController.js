const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const client = new OAuth2Client(process.env.CLIENT_ID);

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

/**
 * Find or create a user from Google profile data.
 * Shared helper for both credential (ID token) and access_token flows.
 */
const findOrCreateGoogleUser = async ({ googleId, email, name, picture }) => {
    if (!email) {
        throw new Error('Google account has no email address');
    }

    let user = await User.findOne({ email });

    if (user) {
        // Link Google to existing account if not already linked
        if (!user.googleId) {
            user.googleId = googleId;
            if (!user.avatar && picture) user.avatar = picture;
            await user.save({ validateBeforeSave: false });
        }
    } else {
        // Create a brand-new Google user
        user = await User.create({
            name,
            email,
            googleId,
            authProvider: 'google',
            avatar: picture || '',
        });
    }

    return user;
};

// @desc    Google OAuth Sign In / Sign Up
// @route   POST /api/auth/google
// @access  Public
// Accepts either:
//   { credential }          — Google ID token (from GoogleLogin button / One Tap)
//   { googleAccessToken, googleUserInfo } — access token + user info (from useGoogleLogin implicit flow)
exports.googleAuth = async (req, res) => {
    try {
        const { credential, googleAccessToken, googleUserInfo } = req.body;

        let googleId, email, name, picture;

        if (credential) {
            // ── ID Token flow (GoogleLogin button) ──────────────────────
            const ticket = await client.verifyIdToken({
                idToken: credential,
                audience: process.env.CLIENT_ID,
            });
            const payload = ticket.getPayload();
            googleId  = payload.sub;
            email     = payload.email;
            name      = payload.name;
            picture   = payload.picture;

        } else if (googleAccessToken && googleUserInfo) {
            // ── Access Token flow (useGoogleLogin implicit) ───────────────
            // Validate the access token by calling Google userinfo
            const infoRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${googleAccessToken}` },
            });
            const info = infoRes.data;

            // Double-check: ensure the sub from userinfo matches what frontend sent
            if (info.sub !== googleUserInfo.sub) {
                return res.status(401).json({ success: false, error: 'Google token mismatch. Please try again.' });
            }

            googleId = info.sub;
            email    = info.email;
            name     = info.name;
            picture  = info.picture;

        } else {
            return res.status(400).json({ success: false, error: 'Google credential or access token is required' });
        }

        const user = await findOrCreateGoogleUser({ googleId, email, name, picture });

        return res.status(200).json({
            success: true,
            _id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            avatar: user.avatar,
            authProvider: user.authProvider,
            token: generateToken(user.id),
        });

    } catch (error) {
        console.error('[googleAuth] Error:', error.message);
        if (error.message?.includes('Token used too late')) {
            return res.status(401).json({ success: false, error: 'Google token has expired. Please try again.' });
        }
        if (error.message?.includes('Invalid token signature')) {
            return res.status(401).json({ success: false, error: 'Invalid Google token. Please try again.' });
        }
        if (error.message?.includes('no email')) {
            return res.status(400).json({ success: false, error: error.message });
        }
        return res.status(500).json({ success: false, error: 'Google authentication failed. Please try again.' });
    }
};

// @desc    Google OAuth Callback (redirect-based — registered in Google Console)
// @route   GET /api/auth/google/callback
// @access  Public
exports.googleCallback = async (req, res) => {
    try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://toolbasketai.com';
        res.redirect(`${frontendUrl}/login?error=Please+use+the+Google+Sign-In+button`);
    } catch (error) {
        console.error('[googleCallback] Error:', error.message);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
