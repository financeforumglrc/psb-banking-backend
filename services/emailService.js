/**
 * Email Notification Service
 * SendGrid/Nodemailer integration
 */

let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.warn('nodemailer not installed. Email service disabled.');
}

class EmailService {
    constructor() {
        if (!nodemailer) {
            this.transporter = null;
            return;
        }
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    async sendEmail(to, subject, html, text) {
        if (!this.transporter) {
            console.warn('Email service not available - nodemailer not installed');
            return { messageId: 'fallback', preview: text };
        }
        const info = await this.transporter.sendMail({
            from: `"DS Financial" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
            html
        });
        return info;
    }

    async sendWelcomeEmail(user) {
        const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#1A237E">Welcome to DS Financial!</h2>
                <p>Hi ${user.name},</p>
                <p>Your account has been created successfully. Start exploring our patent-protected financial tools:</p>
                <ul>
                    <li>GSTIN Risk Intelligence Validator</li>
                    <li>Multi-Regime Tax Optimizer</li>
                    <li>AI Tax Advisor</li>
                </ul>
                <a href="https://dsfinancial-india.surge.sh" 
                   style="background:#1A237E;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px">
                   Get Started
                </a>
            </div>
        `;

        return this.sendEmail(
            user.email,
            'Welcome to DS Financial - Patent-Protected Financial Tools',
            html,
            `Welcome ${user.name}! Your DS Financial account is ready.`
        );
    }

    async sendTaxReminder(user, dueDate) {
        const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#EF4444">Tax Filing Reminder</h2>
                <p>Hi ${user.name},</p>
                <p>Your tax filing deadline is approaching:</p>
                <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">
                    <strong>Due Date:</strong> ${dueDate}
                </div>
                <a href="https://dsfinancial-india.surge.sh/tax-portal.html"
                   style="background:#1A237E;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">
                   File Now
                </a>
            </div>
        `;

        return this.sendEmail(
            user.email,
            'Tax Filing Reminder - Due Soon!',
            html,
            `Your tax filing is due on ${dueDate}. Don't miss the deadline!`
        );
    }

    escapeHtml(unsafe) {
        if (unsafe == null) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async sendCalculationReport(user, calculation) {
        const safeType = this.escapeHtml(calculation.type);
        const safeName = this.escapeHtml(user.name);
        const safeOutputs = this.escapeHtml(JSON.stringify(calculation.outputs, null, 2));
        const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#1A237E">Your ${safeType} Report</h2>
                <p>Hi ${safeName},</p>
                <p>Your calculation is complete. Here are the results:</p>
                <pre style="background:#f5f5f5;padding:16px;border-radius:8px">${safeOutputs}</pre>
            </div>
        `;

        return this.sendEmail(
            user.email,
            `DS Financial - ${safeType} Report`,
            html,
            'Your calculation report is ready.'
        );
    }
}

module.exports = new EmailService();
