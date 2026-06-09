const GSTINValidatorPro = require('../../algorithms/gstinValidator');

describe('GSTIN Risk Intelligence Validator (PAT-001)', () => {
    
    describe('calculateChecksum', () => {
        it('should correctly calculate the checksum digit for a valid GSTIN', () => {
            // Provide a known valid GSTIN without its checksum to verify the calculation
            const validGstin = '27AAPFU0939F1Z'; // 14 chars
            const checksum = GSTINValidatorPro.calculateChecksum(validGstin);
            expect(typeof checksum).toBe('string');
            expect(checksum.length).toBe(1);
        });
    });

    describe('validateComprehensive', () => {
        it('should flag an invalid GSTIN format with critical risk', () => {
            const result = GSTINValidatorPro.validateComprehensive('INVALID_GSTIN');
            
            expect(result.isValid).toBe(false);
            expect(result.riskLevel).toBe('critical');
            expect(result.riskScore).toBeGreaterThanOrEqual(100);
            expect(result.checksPerformed[0].status).toBe('fail');
        });

        it('should process a well-formed synthetic GSTIN (Medium Risk example)', () => {
            // Using a synthetic valid-format GSTIN: 27AAAAA0000A1Z5
            // 27 (Maharashtra) AAAAA0000A (PAN) 1 (Reg) Z (Default) 5 (Checksum)
            // It has '0000' which is a suspicious sequence.
            const syntheticGstin = '27AAAAA0000A1Z5';
            
            // Adjust the 15th character to be the correct checksum
            const base14 = syntheticGstin.substring(0, 14);
            const correctChecksum = GSTINValidatorPro.calculateChecksum(base14);
            const testGstin = base14 + correctChecksum;
            
            const result = GSTINValidatorPro.validateComprehensive(testGstin);
            
            expect(result.state.name).toBe('Maharashtra');
            expect(result.panNumber).toBe('AAAAA0000A');
            // Entity Type from 'A' as 4th char of PAN -> 'Association of Persons'
            expect(result.entityType).toBe('Association of Persons');
            // Contains 0000 so it should have a warning alert
            const hasSuspiciousAlert = result.alerts.some(a => a.message.includes('0000'));
            expect(hasSuspiciousAlert).toBe(true);
        });

        it('should catch invalid state codes and increment risk score', () => {
            // 99 is not a valid state code
            const syntheticGstin = '99AAAAA0000A1Z5';
            const base14 = syntheticGstin.substring(0, 14);
            const testGstin = base14 + GSTINValidatorPro.calculateChecksum(base14);
            
            const result = GSTINValidatorPro.validateComprehensive(testGstin);
            
            expect(result.alerts.some(a => a.message.includes('Invalid state code'))).toBe(true);
        });
        
        it('should catch checksum mismatches and increment risk score significantly', () => {
            // 27AAAAA0000A1ZZ -> Checksum is deliberately incorrect
            const result = GSTINValidatorPro.validateComprehensive('27AAAAA0000A1ZZ');
            
            // Checksum check is the 7th check (index 6)
            expect(result.checksPerformed[6].status).toBe('fail');
            expect(result.alerts.some(a => a.message.includes('Checksum mismatch'))).toBe(true);
            expect(result.isValid).toBe(false);
        });
    });

    describe('generateReportHTML', () => {
        it('should generate an HTML string containing the risk level and state name', () => {
            const mockResult = {
                gstin: '27AAAAA0000A1Z5',
                state: { name: 'Maharashtra', region: 'West' },
                panNumber: 'AAAAA0000A',
                entityType: 'Association of Persons',
                registrationType: { type: 'Regular', desc: 'Normal Taxpayer' },
                riskScore: 25,
                riskLevel: 'low-risk',
                checksPerformed: [
                    { check: 'Format Check', status: 'pass' },
                    { check: 'State Code', status: 'pass' }
                ],
                alerts: [
                    { type: 'warning', message: 'Test warning' }
                ],
                compliance: { eInvoiceEligible: false }
            };
            
            const html = GSTINValidatorPro.generateReportHTML(mockResult);
            
            expect(html).toContain('Maharashtra');
            expect(html).toContain('low-risk');
            expect(html).toContain('Test warning');
        });
    });
});
