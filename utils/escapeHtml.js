/**
 * HTML Escaping Utility
 * Prevents XSS in algorithm-generated HTML reports
 */

function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    if (typeof unsafe !== 'string') unsafe = String(unsafe);
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeHtmlAttr(unsafe) {
    if (unsafe == null) return '';
    if (typeof unsafe !== 'string') unsafe = String(unsafe);
    // Stricter escaping for attributes
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#96;')
        .replace(/\(/g, '&#40;')
        .replace(/\)/g, '&#41;');
}

module.exports = { escapeHtml, escapeHtmlAttr };
