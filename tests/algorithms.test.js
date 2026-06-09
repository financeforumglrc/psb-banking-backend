const GSTINValidator = require('../algorithms/gstinValidator');
const ShellCompanyDetector = require('../algorithms/shellCompanyDetector');
const TaxRateErrorDetector = require('../algorithms/taxRateErrorDetector');
const MissingITCRecovery = require('../algorithms/missingITCRecovery');
const TaxOptimizer = require('../algorithms/taxOptimizer');
const ITCRiskScanner = require('../algorithms/itcRiskScanner');

describe('Patent Algorithms Unit Tests', () => {

    describe('PAT-001: GSTIN Validator', () => {
        test('should validate valid GSTIN', () => {
            const result = GSTINValidator.validateComprehensive('07AABCU9603R1ZM');
            expect(result.isValid).toBe(true);
            expect(result.checksPerformed[0].status).toBe('pass');
        });

        test('should reject invalid length GSTIN', () => {
            const result = GSTINValidator.validateComprehensive('07AABCU9603R1Z');
            expect(result.isValid).toBe(false);
            expect(result.alerts[0].message).toContain('15 alphanumeric characters');
        });

        test('should reject invalid state code', () => {
            const result = GSTINValidator.validateComprehensive('99AABCU9603R1ZM');
            expect(result.isValid).toBe(false);
        });

        test('should reject invalid PAN format', () => {
            const result = GSTINValidator.validateComprehensive('071234567890R1ZM');
            expect(result.isValid).toBe(false);
        });

        test('should identify suspicious patterns', () => {
            const result1 = GSTINValidator.validateComprehensive('07AABCU0000R1ZM');
            expect(result1.alerts).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ message: expect.stringContaining('000') })
                ])
            );
            
            const result2 = GSTINValidator.validateComprehensive('07AABCU9999R1ZM');
            expect(result2.alerts).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ message: expect.stringContaining('999') })
                ])
            );
            
            const result3 = GSTINValidator.validateComprehensive('07ABCDE1234F1Z5');
            expect(result3).toBeDefined();
        });
        
        test('should identify e-invoice eligibility', () => {
            const result = GSTINValidator.validateComprehensive('07AABCC9603R1ZM');
            expect(result.compliance.eInvoiceEligible).toBe(true);
        });

        test('should generate HTML report', () => {
            const result = GSTINValidator.validateComprehensive('07AABCU9603R1ZM');
            const html = GSTINValidator.generateReportHTML(result);
            expect(html).toContain('class="bm-card"');
            
            const invalidResult = GSTINValidator.validateComprehensive('99AABCU9603R1ZM');
            const invalidHtml = GSTINValidator.generateReportHTML(invalidResult);
            expect(invalidHtml).toContain('class="bm-card"');
        });
        
        test('should escape HTML', () => {
            expect(GSTINValidator.escapeHtml('<script>')).toBe('&lt;script&gt;');
            expect(GSTINValidator.escapeHtml(null)).toBe('');
        });
    });

    describe('PAT-002: ITC Risk Scanner', () => {
        const purchaseData = [
            { invoiceNo: 'INV-1', gstin: '07AABCU9603R1ZM', taxable_value: 1000, cgst: 90, sgst: 90 },
            { invoiceNo: 'INV-2', gstin: '07AABCU9603R1ZM', taxable_value: 2000, cgst: 180, sgst: 180 },
            { invoiceNo: 'INV-3', gstin: '07AABCU9603R1ZM', taxable_value: 3000, cgst: 270, sgst: 270 }
        ];
        
        const gstr2bData = [
            { invoiceNo: 'INV-1', gstin: '07AABCU9603R1ZM', taxable_value: 1000, cgst: 90, sgst: 90 },
            { invoiceNo: 'INV-3', gstin: '07AABCU9603R1ZM', taxable_value: 2000, cgst: 180, sgst: 180 }
        ];

        test('should analyze ITC risks', () => {
            const result = ITCRiskScanner.analyzeITCRisks(purchaseData, gstr2bData);
            expect(result.summary.totalInvoices).toBe(3);
            expect(result.categoryBreakdown.notIn2B.count).toBeGreaterThanOrEqual(1);
        });

        test('should calculate ITC expiry', () => {
            const expiry = ITCRiskScanner.calculateITCExpiry('2023-01-15');
            expect(expiry).toBeInstanceOf(Date);
        });

        test('should generate HTML summary', () => {
            const result = ITCRiskScanner.analyzeITCRisks(purchaseData, gstr2bData);
            const html = ITCRiskScanner.generateSummaryHTML(result);
            expect(html).toContain('bm-itc-scanner-results');
        });
        
        test('should escape HTML', () => {
            expect(ITCRiskScanner.escapeHtml('<script>')).toBe('&lt;script&gt;');
        });
    });

    describe('PAT-003: Shell Company Detector', () => {
        const invoiceData = [
            { gstin: '07AABCP9603R1ZM', taxable_value: 5000000, nature_of_business: 'proprietorship' },
            { gstin: '07AABCP9603R1ZM', taxable_value: 5000000 },
            { gstin: '09AABCC1234D1Z5', taxable_value: 10000 }
        ];

        test('should detect potential shell company indicators', () => {
            const result = ShellCompanyDetector.analyzeSuppliers(invoiceData);
            expect(result.summary.totalSuppliers).toBe(2);
            expect(result.riskDistribution).toBeDefined();
        });
        
        test('should handle empty input', () => {
            const result = ShellCompanyDetector.analyzeSuppliers([]);
            expect(result.summary.totalSuppliers).toBe(0);
        });

        test('should generate HTML report', () => {
            const result = ShellCompanyDetector.analyzeSuppliers(invoiceData);
            const html = ShellCompanyDetector.generateHTML(result);
            expect(html).toContain('bm-shell-detect-results');
            
            const cleanResult = ShellCompanyDetector.analyzeSuppliers([]);
            const cleanHtml = ShellCompanyDetector.generateHTML(cleanResult);
            expect(cleanHtml).toContain('No Suspicious Suppliers Detected');
        });
    });

    describe('PAT-004: Tax Optimizer', () => {
        test('should optimize taxes', () => {
            const financials = {
                turnover: 60000000,
                expenses: { rent: 500000, salaries: 2000000 },
                industry: 'manufacturing',
                assets: { plantAndMachinery: 10000000 },
                taxpayerInfo: { age: 30, state: '07' },
                income: 3000000,
                currentInvestments: 50000,
                rent: 200000,
                priority: 'maximize'
            };
            const result = TaxOptimizer.optimizeTaxes(financials);
            expect(result).toBeDefined();
            expect(result.optimal).toBeDefined();
            expect(result.savings).toBeDefined();
            expect(result.recommendations).toBeInstanceOf(Array);
        });
        
        test('should handle edge case inputs', () => {
            const result = TaxOptimizer.optimizeTaxes({ income: 500000, currentInvestments: 0 });
            expect(result).toBeDefined();
        });
    });

    describe('PAT-005: Tax Rate Error Detector', () => {
        const invoices = [
            { invoiceNo: 'INV-1', hsn: '8517', rate: 12, taxable_value: 1000 }, // Error (should be 18)
            { invoiceNo: 'INV-2', hsn: '8517', rate: 18, taxable_value: 1000 }, // Correct
            { invoiceNo: 'INV-3', hsn: '9999', rate: 5, taxable_value: 1000 },  // Unknown
            { invoiceNo: 'INV-4', hsn: '8517', rate: 28, taxable_value: 1000, description: 'Smartphone' } // Overcharged
        ];

        test('should verify HSN rates', () => {
            const result = TaxRateErrorDetector.analyzeRates(invoices);
            expect(result.summary.errorsFound).toBeGreaterThanOrEqual(1);
        });

        test('should find correct rate with partial match', () => {
            const rate = TaxRateErrorDetector.findCorrectRate('851712', '');
            expect(rate).toBe(18);
        });

        test('should generate HTML report', () => {
            const result = TaxRateErrorDetector.analyzeRates(invoices);
            const html = TaxRateErrorDetector.generateHTML(result);
            expect(html).toContain('bm-table');
        });
    });

    describe('PAT-006: Missing ITC Recovery Predictor', () => {
        const purchaseData = [
            { invoiceNo: 'INV-1', gstin: '07AABCU9603R1ZM', taxable_value: 1000, cgst: 90, sgst: 90, invoiceDate: '2025-01-01' }
        ];
        const gstr2bData = [
            { invoiceNo: 'INV-1', gstin: '07AABCU9603R1ZM', taxable_value: 1000, cgst: 90, sgst: 90, invoiceDate: '2025-01-01' },
            { invoiceNo: 'INV-3', gstin: '07AABCU9603R1ZM', taxable_value: 2000, cgst: 180, sgst: 180, invoiceDate: '2025-02-01' },
            { invoiceNo: 'INV-4', gstin: '07AABCU9603R1ZM', taxable_value: 3000, cgst: 270, sgst: 270, invoiceDate: '2023-01-01' } // Expired soon
        ];

        test('should predict ITC recovery', () => {
            const result = MissingITCRecovery.analyzeMissingITC(purchaseData, gstr2bData);
            expect(result.summary.totalMissingITC).toBeGreaterThan(0);
            expect(result.missingInvoices.length).toBeGreaterThanOrEqual(1);
        });

        test('should handle empty purchase data', () => {
            const result = MissingITCRecovery.analyzeMissingITC([], gstr2bData);
            expect(result.missingInvoices.length).toBe(gstr2bData.length);
        });

        test('should handle empty GSTR-2B data', () => {
            const result = MissingITCRecovery.analyzeMissingITC(purchaseData, []);
            expect(result.missingInvoices.length).toBe(0);
        });

        test('should calculate ITC expiry', () => {
            const expiry = MissingITCRecovery.calculateITCExpiry('2023-04-15');
            expect(expiry).toBeInstanceOf(Date);
        });

        test('should generate HTML report', () => {
            const result = MissingITCRecovery.analyzeMissingITC(purchaseData, gstr2bData);
            const html = MissingITCRecovery.generateHTML(result);
            expect(html).toContain('bm-card');
        });
    });
});
