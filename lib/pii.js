/**
 * PII / PIL masking utilities
 */

function maskPan(pan) {
    if (!pan || pan.length < 5) return pan;
    return pan.slice(0, 2) + 'XXXXX' + pan.slice(-3);
}

function maskAadhaar(aadhaar) {
    if (!aadhaar || aadhaar.length < 4) return aadhaar;
    return 'XXXX-XXXX-' + aadhaar.slice(-4);
}

function maskGstin(gstin) {
    if (!gstin || gstin.length < 6) return gstin;
    return gstin.slice(0, 2) + '****' + gstin.slice(-3);
}

module.exports = {
    maskPan,
    maskAadhaar,
    maskGstin,
};
