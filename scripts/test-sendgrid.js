const sgMail = require('@sendgrid/mail');
const key = process.argv[2];
if (!key) {
    console.error('Usage: node test-sendgrid.js <SENDGRID_API_KEY>');
    process.exit(1);
}
sgMail.setApiKey(key);

(async () => {
    try {
        await sgMail.send({
            to: 'sdeepu70gg@gmail.com',
            from: { email: 'sdeepu70gg@gmail.com', name: 'PSB SecureWealth' },
            subject: 'Test OTP',
            text: '123456',
            html: '<b>123456</b>'
        });
        console.log('SendGrid send succeeded');
    } catch (err) {
        console.error('SendGrid send failed:');
        if (err.response && err.response.body) {
            console.error(JSON.stringify(err.response.body, null, 2));
        } else {
            console.error(err.message);
        }
    }
})();
