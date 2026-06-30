const nodemailer = require('nodemailer');

/**
 * Send an email using Gmail App Password (OAuth-free, no SMTP host config needed).
 *
 * Required .env variables:
 *   EMAIL_USER  — Gmail address (e.g. toolbasketai@gmail.com)
 *   EMAIL_PASS  — Gmail App Password (16-char, spaces allowed)
 *
 * @param {Object} options
 * @param {string} options.email    - Recipient email address
 * @param {string} options.subject  - Email subject line
 * @param {string} options.message  - Plain-text body (fallback)
 * @param {string} [options.html]   - HTML body (optional, overrides plain text)
 */
const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: `"ToolBasket" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        ...(options.html && { html: options.html }),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent to ${options.email} — MessageId: ${info.messageId}`);

    return info;
};

module.exports = sendEmail;
