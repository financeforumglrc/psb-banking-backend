const crypto = require('crypto');

function maskEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    const maskedLocal = local.length <= 2 ? '*'.repeat(local.length) : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;
    const parts = domain.split('.');
    const maskedDomain = parts.map((p, i) => {
        if (i === parts.length - 1) return p; // keep TLD
        return p.length <= 2 ? p : `${p[0]}${'*'.repeat(p.length - 2)}${p[p.length - 1]}`;
    }).join('.');
    return `${maskedLocal}@${maskedDomain}`;
}

function maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return phone;
    return `${phone.slice(0, -4).replace(/\d/g, '*')}${phone.slice(-4)}`;
}

function maskPan(pan) {
    if (!pan || typeof pan !== 'string' || pan.length < 6) return pan;
    return `${pan.slice(0, 2)}${'*'.repeat(pan.length - 4)}${pan.slice(-2)}`;
}

function maskAadhaar(aadhaar) {
    if (!aadhaar || typeof aadhaar !== 'string') return aadhaar;
    const digits = aadhaar.replace(/\D/g, '');
    if (digits.length !== 12) return aadhaar;
    return `XXXX-XXXX-${digits.slice(-4)}`;
}

function maskUser(user) {
    if (!user) return user;
    return {
        ...user,
        email: maskEmail(user.email),
        phone: maskPhone(user.phone),
        pan_number: maskPan(user.pan_number),
        aadhar: maskAadhaar(user.aadhar)
    };
}

function redactBody(body) {
    if (!body || typeof body !== 'object') return body;
    const sensitiveKeys = ['password', 'token', 'refreshToken', 'aadhar', 'pan_number', 'panNumber', 'aadhaar', 'ssn', 'creditCard', 'cvv', 'accountNumber'];
    const clone = Array.isArray(body) ? [...body] : { ...body };
    for (const key of Object.keys(clone)) {
        const lower = key.toLowerCase();
        if (sensitiveKeys.includes(key) || sensitiveKeys.includes(lower)) {
            clone[key] = '[REDACTED]';
        } else if (typeof clone[key] === 'object' && clone[key] !== null) {
            clone[key] = redactBody(clone[key]);
        }
    }
    return clone;
}

function hashIdentifier(value) {
    if (!value) return value;
    return crypto.createHash('sha256').update(String(value).toUpperCase().trim()).digest('hex');
}

module.exports = {
    maskEmail,
    maskPhone,
    maskPan,
    maskAadhaar,
    maskUser,
    redactBody,
    hashIdentifier
};
