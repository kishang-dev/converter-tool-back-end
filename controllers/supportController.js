const sendEmail = require('../utils/sendEmail');

// @desc    Contact form submission
// @route   POST /api/support/contact
// @access  Public
exports.submitContactForm = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ success: false, error: 'Please provide all fields' });
        }

        // Send email to admin
        await sendEmail({
            email: process.env.CONTACT_EMAIL,
            subject: `Contact Form Submission: ${subject}`,
            message: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
            html: `<h3>New Contact Form Submission</h3>
                   <p><strong>Name:</strong> ${name}</p>
                   <p><strong>Email:</strong> ${email}</p>
                   <p><strong>Subject:</strong> ${subject}</p>
                   <p><strong>Message:</strong></p>
                   <p>${message}</p>`
        });

        res.status(200).json({ success: true, data: 'Message sent successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
