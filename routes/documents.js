/**
 * Document API Routes
 * PDF generation, invoice generation, report generation
 */

const express = require('express');
const router = express.Router();

/**
 * @route   POST /api/v1/documents/generate-invoice
 * @desc    Generate GST-compliant invoice
 * @access  Private
 */
const MAX_ITEMS = 1000;
const MAX_INVOICE_VALUE = 100000000000; // 1000 Crore max

function numberToWords(num) {
    if (typeof num !== 'number' || isNaN(num) || num < 0) return 'Invalid Amount';
    if (num > Number.MAX_SAFE_INTEGER) return 'Amount too large';
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num === 0) return 'Zero';
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '');
    if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
    if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
    if (num < 100000000000) return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
    return 'Amount exceeds limit';
}

router.post('/generate-invoice', (req, res) => {
    try {
        const invoiceData = req.body;
        
        // Validate required fields
        const required = ['sellerName', 'sellerGSTIN', 'buyerName', 'items'];
        const missing = required.filter(field => !invoiceData[field]);
        
        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${missing.join(', ')}`,
                code: 'FIELDS_MISSING'
            });
        }

        // Calculate totals
        let totalTaxable = 0;
        let totalCGST = 0;
        let totalSGST = 0;
        let totalIGST = 0;
        
        if (!Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invoice must contain at least one item',
                code: 'ITEMS_MISSING'
            });
        }
        if (invoiceData.items.length > MAX_ITEMS) {
            return res.status(400).json({
                success: false,
                error: `Invoice cannot contain more than ${MAX_ITEMS} items`,
                code: 'TOO_MANY_ITEMS'
            });
        }

        const processedItems = invoiceData.items.map(item => {
            const qty = Math.max(0, parseFloat(item.quantity) || 0);
            const rate = Math.max(0, parseFloat(item.rate) || 0);
            const taxable = qty * rate;
            const cgst = taxable * (parseFloat(item.cgstRate) || 0) / 100;
            const sgst = taxable * (parseFloat(item.sgstRate) || 0) / 100;
            const igst = taxable * (parseFloat(item.igstRate) || 0) / 100;
            
            totalTaxable += taxable;
            totalCGST += cgst;
            totalSGST += sgst;
            totalIGST += igst;
            
            return {
                ...item,
                quantity: qty,
                rate: rate,
                taxableValue: taxable,
                cgstAmount: cgst,
                sgstAmount: sgst,
                igstAmount: igst,
                total: taxable + cgst + sgst + igst
            };
        });

        const grandTotal = totalTaxable + totalCGST + totalSGST + totalIGST;
        if (grandTotal > MAX_INVOICE_VALUE) {
            return res.status(400).json({
                success: false,
                error: 'Invoice total exceeds maximum allowed value',
                code: 'VALUE_TOO_LARGE'
            });
        }

        const invoice = {
            invoiceNumber: invoiceData.invoiceNumber || `INV-${Date.now()}`,
            invoiceDate: invoiceData.invoiceDate || new Date().toISOString().split('T')[0],
            dueDate: invoiceData.dueDate,
            seller: {
                name: invoiceData.sellerName,
                gstin: invoiceData.sellerGSTIN,
                address: invoiceData.sellerAddress,
                state: invoiceData.sellerState,
                stateCode: invoiceData.sellerStateCode
            },
            buyer: {
                name: invoiceData.buyerName,
                gstin: invoiceData.buyerGSTIN,
                address: invoiceData.buyerAddress,
                state: invoiceData.buyerState,
                stateCode: invoiceData.buyerStateCode
            },
            items: processedItems,
            totals: {
                taxableValue: totalTaxable,
                cgst: totalCGST,
                sgst: totalSGST,
                igst: totalIGST,
                totalTax: totalCGST + totalSGST + totalIGST,
                grandTotal: totalTaxable + totalCGST + totalSGST + totalIGST,
                roundOff: 0,
                totalPayable: Math.round(grandTotal)
            },
            amountInWords: numberToWords(Math.round(grandTotal)),
            bankDetails: invoiceData.bankDetails,
            terms: invoiceData.terms,
            generatedAt: new Date().toISOString()
        };

        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        console.error('Invoice generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Invoice generation failed',
            code: 'GENERATION_ERROR'
        });
    }
});

/**
 * @route   POST /api/v1/documents/generate-report
 * @desc    Generate tax analysis report
 * @access  Private
 */
router.post('/generate-report', (req, res) => {
    try {
        const { type, data, format } = req.body;

        if (!type || !data) {
            return res.status(400).json({
                success: false,
                error: 'Report type and data are required',
                code: 'FIELDS_MISSING'
            });
        }

        const report = {
            reportId: `RPT-${Date.now()}`,
            type,
            format: format || 'json',
            generatedAt: new Date().toISOString(),
            data
        };

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Report generation failed',
            code: 'GENERATION_ERROR'
        });
    }
});

module.exports = router;
