/**
 * PATENT #5: Tax Rate Error Detector v2.0
 * DS Financial Solutions - Proprietary Algorithm
 * Patent Pending - Trade Secret Protected
 */

const TaxRateErrorDetector = {
    // Comprehensive HSN Database with correct GST rates
    hsnDatabase: {
        // Chapter 84 - Machinery
        '8471': { rate: 18, description: 'Computers, Laptops, Data Processing Machines', category: 'Electronics' },
        '8473': { rate: 18, description: 'Computer Parts & Accessories', category: 'Electronics' },
        '8443': { rate: 18, description: 'Printers, Photocopiers', category: 'Office Equipment' },
        '8471.30': { rate: 18, description: 'Portable Computers (Laptops)', category: 'Electronics' },
        '8471.41': { rate: 18, description: 'Desktop Computers', category: 'Electronics' },
        '8471.49': { rate: 18, description: 'Other Computers', category: 'Electronics' },
        
        // Chapter 85 - Electrical Equipment
        '8517': { rate: 18, description: 'Telephones, Smartphones', category: 'Electronics' },
        '8517.12': { rate: 18, description: 'Mobile Phones, Smartphones', category: 'Electronics' },
        '8528': { rate: 18, description: 'Monitors, TVs, Projectors', category: 'Electronics' },
        '8528.52': { rate: 18, description: 'Computer Monitors', category: 'Electronics' },
        '8504': { rate: 18, description: 'Transformers, UPS, Power Supplies', category: 'Electronics' },
        
        // Chapter 94 - Furniture
        '9401': { rate: 18, description: 'Seats, Chairs (Office/Home)', category: 'Furniture' },
        '9403': { rate: 18, description: 'Furniture (Other)', category: 'Furniture' },
        '9404': { rate: 18, description: 'Mattresses, Bedding', category: 'Furniture' },
        
        // Chapter 48 - Paper Products
        '4820': { rate: 12, description: 'Registers, Notebooks, Stationery', category: 'Stationery' },
        '4802': { rate: 12, description: 'Paper, Uncoated', category: 'Paper' },
        '4810': { rate: 12, description: 'Paper, Coated', category: 'Paper' },
        
        // Chapter 30 - Pharmaceuticals
        '3004': { rate: 12, description: 'Medicaments (General)', category: 'Pharma' },
        '3004.90': { rate: 5, description: 'Life-saving Drugs', category: 'Pharma' },
        '3002': { rate: 5, description: 'Vaccines, Blood Products', category: 'Pharma' },
        '3006': { rate: 12, description: 'Pharmaceutical Goods', category: 'Pharma' },
        
        // Chapter 22 - Beverages
        '2201': { rate: 0, description: 'Water (Natural, Not Aerated)', category: 'Beverages' },
        '2202': { rate: 28, description: 'Aerated Beverages, Soft Drinks', category: 'Beverages' },
        '2202.10': { rate: 28, description: 'Aerated Waters with Sugar', category: 'Beverages' },
        
        // Chapter 87 - Vehicles
        '8703': { rate: 28, description: 'Motor Cars, SUVs', category: 'Automobiles' },
        '8703.21': { rate: 28, description: 'Small Cars (<1200cc petrol)', category: 'Automobiles' },
        '8711': { rate: 28, description: 'Motorcycles, Scooters', category: 'Automobiles' },
        '8704': { rate: 28, description: 'Commercial Vehicles, Trucks', category: 'Automobiles' },
        
        // Services (SAC Codes)
        '9954': { rate: 18, description: 'Construction Services', category: 'Services' },
        '9954.11': { rate: 12, description: 'Affordable Housing Construction', category: 'Services' },
        '9963': { rate: 12, description: 'Accommodation Services (Hotels <7500)', category: 'Services' },
        '9963.10': { rate: 18, description: 'Hotel Accommodation (>7500)', category: 'Services' },
        '9971': { rate: 18, description: 'Financial Services', category: 'Services' },
        '9972': { rate: 18, description: 'Real Estate Services', category: 'Services' },
        '9973': { rate: 18, description: 'Leasing/Rental Services', category: 'Services' },
        '9983': { rate: 18, description: 'Professional Services', category: 'Services' },
        '9984': { rate: 18, description: 'Telecom Services', category: 'Services' },
        '9985': { rate: 18, description: 'Support Services', category: 'Services' },
        '9986': { rate: 18, description: 'Support Services (Manufacturing)', category: 'Services' },
        '9987': { rate: 5, description: 'Maintenance & Repair Services', category: 'Services' },
        '9988': { rate: 18, description: 'Manufacturing Services', category: 'Services' },
        '9991': { rate: 18, description: 'Public Administration Services', category: 'Services' },
        '9992': { rate: 0, description: 'Education Services', category: 'Services' },
        '9993': { rate: 0, description: 'Healthcare Services', category: 'Services' },
        '9995': { rate: 18, description: 'Recreational Services', category: 'Services' },
        '9996': { rate: 18, description: 'Personal Services', category: 'Services' },
        '9997': { rate: 18, description: 'Other Services', category: 'Services' },
        
        // Food Items
        '1001': { rate: 0, description: 'Wheat', category: 'Food' },
        '1006': { rate: 5, description: 'Rice (Branded)', category: 'Food' },
        '0402': { rate: 5, description: 'Milk Products', category: 'Food' },
        '1905': { rate: 5, description: 'Bread, Biscuits (Non-branded)', category: 'Food' },
        '2106': { rate: 18, description: 'Food Preparations', category: 'Food' },
        
        // Textiles
        '5208': { rate: 5, description: 'Cotton Fabrics', category: 'Textiles' },
        '6101': { rate: 12, description: 'Readymade Garments (<1000)', category: 'Textiles' },
        '6109': { rate: 12, description: 'T-Shirts, Vests', category: 'Textiles' },
        
        // Gold & Jewellery
        '7108': { rate: 3, description: 'Gold', category: 'Precious Metals' },
        '7113': { rate: 3, description: 'Gold Jewellery', category: 'Precious Metals' },
        '7117': { rate: 3, description: 'Imitation Jewellery', category: 'Precious Metals' }
    },

    // Common errors database for AI detection
    commonErrors: [
        { hsn: '8517', wrongRate: 12, correctRate: 18, frequency: 'Very Common' },
        { hsn: '9963', wrongRate: 18, correctRate: 12, frequency: 'Common' },
        { hsn: '3004', wrongRate: 18, correctRate: 12, frequency: 'Common' },
        { hsn: '4820', wrongRate: 18, correctRate: 12, frequency: 'Moderate' },
        { hsn: '2202', wrongRate: 18, correctRate: 28, frequency: 'Very Common' },
        { hsn: '9954', wrongRate: 12, correctRate: 18, frequency: 'Common' }
    ],

    // Analyze tax rates in data
    analyzeRates(data) {
        const results = {
            summary: {
                totalInvoices: data.length,
                errorsFound: 0,
                overchargedAmount: 0,
                underchargedAmount: 0,
                potentialRefund: 0,
                potentialLiability: 0
            },
            errors: [],
            warnings: [],
            byHSN: {},
            recommendations: []
        };

        data.forEach((invoice, index) => {
            const hsn = invoice.hsn || invoice.HSN || invoice['HSN Code'] || invoice.hsn_code || '';
            const chargedRate = parseFloat(invoice.rate || invoice.gst_rate || invoice['GST Rate'] || invoice['Tax Rate'] || 0);
            const taxableValue = parseFloat(invoice.taxable_value || invoice['Taxable Value'] || invoice.amount || 0);
            const description = invoice.description || invoice.Description || invoice['Item Description'] || '';

            if (!hsn && !description) return;

            const correctRate = this.findCorrectRate(hsn, description);
            
            if (correctRate !== null && chargedRate !== correctRate && chargedRate > 0) {
                const difference = chargedRate - correctRate;
                const impact = (taxableValue * Math.abs(difference)) / 100;

                const error = {
                    index: index + 1,
                    invoiceNo: invoice.invoice_no || invoice['Invoice No'] || `Row ${index + 1}`,
                    hsn: hsn,
                    description: description.substring(0, 50),
                    chargedRate: chargedRate,
                    correctRate: correctRate,
                    taxableValue: taxableValue,
                    impact: impact,
                    type: difference > 0 ? 'OVERCHARGED' : 'UNDERCHARGED',
                    severity: Math.abs(difference) >= 10 ? 'HIGH' : Math.abs(difference) >= 5 ? 'MEDIUM' : 'LOW'
                };

                results.errors.push(error);
                results.summary.errorsFound++;

                if (difference > 0) {
                    results.summary.overchargedAmount += impact;
                    results.summary.potentialRefund += impact;
                } else {
                    results.summary.underchargedAmount += impact;
                    results.summary.potentialLiability += impact;
                }

                // Track by HSN
                if (!results.byHSN[hsn]) {
                    results.byHSN[hsn] = { count: 0, totalImpact: 0, errors: [] };
                }
                results.byHSN[hsn].count++;
                results.byHSN[hsn].totalImpact += impact;
                results.byHSN[hsn].errors.push(error);
            }
        });

        // Generate recommendations
        results.recommendations = this.generateTaxRateRecommendations(results);

        return results;
    },

    findCorrectRate(hsn, description) {
        // First try exact HSN match
        if (hsn && this.hsnDatabase[hsn]) {
            return this.hsnDatabase[hsn].rate;
        }

        // Try partial HSN match (first 4 digits)
        if (hsn && hsn.length >= 4) {
            const prefix = hsn.substring(0, 4);
            if (this.hsnDatabase[prefix]) {
                return this.hsnDatabase[prefix].rate;
            }
        }

        // Try description-based matching
        if (description) {
            const desc = description.toLowerCase();
            
            // Electronics
            if (desc.includes('laptop') || desc.includes('computer') || desc.includes('desktop')) return 18;
            if (desc.includes('mobile') || desc.includes('phone') || desc.includes('smartphone')) return 18;
            if (desc.includes('printer') || desc.includes('scanner')) return 18;
            
            // Furniture
            if (desc.includes('chair') || desc.includes('table') || desc.includes('furniture')) return 18;
            
            // Stationery
            if (desc.includes('stationery') || desc.includes('notebook') || desc.includes('paper')) return 12;
            
            // Pharma
            if (desc.includes('medicine') || desc.includes('tablet') || desc.includes('capsule')) return 12;
            
            // Beverages
            if (desc.includes('soft drink') || desc.includes('cola') || desc.includes('aerated')) return 28;
            
            // Services
            if (desc.includes('service') || desc.includes('consulting') || desc.includes('professional')) return 18;
            if (desc.includes('hotel') || desc.includes('accommodation')) return 12;
            if (desc.includes('construction') || desc.includes('building')) return 18;
        }

        return null;
    },

    generateTaxRateRecommendations(results) {
        const recommendations = [];

        if (results.summary.potentialRefund > 0) {
            recommendations.push({
                priority: 'HIGH',
                type: 'refund',
                icon: 'fa-hand-holding-usd',
                title: 'Claim Excess Tax Refund',
                description: `You have been overcharged GST of ₹${this.formatMoney(results.summary.potentialRefund)}. File for refund under Section 54.`,
                action: 'Generate Refund Application'
            });
        }

        if (results.summary.potentialLiability > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                type: 'liability',
                icon: 'fa-exclamation-triangle',
                title: 'Pay Differential Tax',
                description: `You have been undercharged GST of ₹${this.formatMoney(results.summary.potentialLiability)}. Pay immediately to avoid interest & penalty.`,
                action: 'Calculate Interest & Pay'
            });
        }

        // Most common HSN errors
        const topErrors = Object.entries(results.byHSN)
            .sort((a, b) => b[1].totalImpact - a[1].totalImpact)
            .slice(0, 3);

        if (topErrors.length > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                type: 'training',
                icon: 'fa-graduation-cap',
                title: 'Train Vendors on HSN Rates',
                description: `Top error-prone HSN codes: ${topErrors.map(e => e[0]).join(', ')}. Share correct rate reference with suppliers.`,
                action: 'Generate Training Material'
            });
        }

        return recommendations;
    },

    formatMoney(amount) {
        if (amount >= 10000000) return (amount / 10000000).toFixed(2) + ' Cr';
        if (amount >= 100000) return (amount / 100000).toFixed(2) + ' L';
        return amount.toLocaleString('en-IN');
    },

    generateHTML(results) {
        return `
            <div class="bm-tax-rate-results animate__animated animate__fadeIn">
                <!-- Summary Cards -->
                <div class="bm-stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 1.5rem;">
                    <div class="bm-stat-card warning">
                        <div class="bm-stat-icon"><i class="fas fa-exclamation-circle"></i></div>
                        <div class="bm-stat-value">${results.summary.errorsFound}</div>
                        <div class="bm-stat-label">Rate Errors Found</div>
                    </div>
                    <div class="bm-stat-card safe">
                        <div class="bm-stat-icon"><i class="fas fa-arrow-up"></i></div>
                        <div class="bm-stat-value">₹${this.formatMoney(results.summary.overchargedAmount)}</div>
                        <div class="bm-stat-label">Overcharged (Refund Due)</div>
                    </div>
                    <div class="bm-stat-card danger">
                        <div class="bm-stat-icon"><i class="fas fa-arrow-down"></i></div>
                        <div class="bm-stat-value">₹${this.formatMoney(results.summary.underchargedAmount)}</div>
                        <div class="bm-stat-label">Undercharged (Liability)</div>
                    </div>
                    <div class="bm-stat-card info">
                        <div class="bm-stat-icon"><i class="fas fa-balance-scale"></i></div>
                        <div class="bm-stat-value">₹${this.formatMoney(Math.abs(results.summary.potentialRefund - results.summary.potentialLiability))}</div>
                        <div class="bm-stat-label">Net ${results.summary.potentialRefund > results.summary.potentialLiability ? 'Refund' : 'Liability'}</div>
                    </div>
                </div>

                ${results.errors.length > 0 ? `
                    <!-- Error Table -->
                    <div class="bm-card" style="margin-bottom: 1.5rem;">
                        <div class="bm-card-header">
                            <div class="bm-card-title"><i class="fas fa-percent"></i> Tax Rate Discrepancies</div>
                            <button class="bm-btn bm-btn-secondary" onclick="exportTaxRateErrors()">
                                <i class="fas fa-download"></i> Export
                            </button>
                        </div>
                        <div class="bm-table-container" style="max-height: 350px; overflow-y: auto;">
                            <table class="bm-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Invoice/HSN</th>
                                        <th>Description</th>
                                        <th>Charged</th>
                                        <th>Correct</th>
                                        <th>Impact</th>
                                        <th>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${results.errors.slice(0, 30).map(err => `
                                        <tr>
                                            <td>${err.index}</td>
                                            <td>
                                                <div style="font-size: 0.8rem; font-family: var(--bm-font-mono);">${err.invoiceNo}</div>
                                                <div style="font-size: 0.7rem; color: var(--bm-text-secondary);">HSN: ${err.hsn || 'N/A'}</div>
                                            </td>
                                            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${err.description}</td>
                                            <td style="color: ${err.type === 'OVERCHARGED' ? 'var(--bm-danger)' : 'var(--bm-warning)'}; font-weight: 600;">${err.chargedRate}%</td>
                                            <td style="color: var(--bm-safe); font-weight: 600;">${err.correctRate}%</td>
                                            <td style="font-weight: 600;">₹${err.impact.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                            <td>
                                                <span class="bm-risk-badge" style="background: ${err.type === 'OVERCHARGED' ? 'rgba(0,255,136,0.15)' : 'rgba(255,68,68,0.15)'}; color: ${err.type === 'OVERCHARGED' ? 'var(--bm-safe)' : 'var(--bm-danger)'}; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">
                                                    ${err.type === 'OVERCHARGED' ? '↑ Refund' : '↓ Pay'}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : `
                    <div class="bm-card" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-check-circle" style="font-size: 3rem; color: var(--bm-safe); margin-bottom: 1rem; display: block;"></i>
                        <h3 style="color: var(--bm-safe);">No Tax Rate Errors Found!</h3>
                        <p style="color: var(--bm-text-secondary);">All invoices have correct GST rates applied.</p>
                    </div>
                `}

                <!-- Recommendations -->
                ${results.recommendations.length > 0 ? `
                    <div class="bm-card">
                        <div class="bm-card-header">
                            <div class="bm-card-title"><i class="fas fa-lightbulb"></i> Recommended Actions</div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                            ${results.recommendations.map(rec => `
                                <div style="padding: 1rem; background: var(--bm-bg-secondary); border-radius: 12px; border-left: 4px solid ${rec.priority === 'CRITICAL' ? 'var(--bm-danger)' : rec.priority === 'HIGH' ? 'var(--bm-safe)' : 'var(--bm-neon-cyan)'};">
                                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                        <i class="fas ${rec.icon}" style="color: ${rec.priority === 'CRITICAL' ? 'var(--bm-danger)' : rec.priority === 'HIGH' ? 'var(--bm-safe)' : 'var(--bm-neon-cyan)'}; font-size: 1.25rem;"></i>
                                        <h4 style="margin: 0; font-size: 0.9rem;">${rec.title}</h4>
                                    </div>
                                    <p style="font-size: 0.8rem; color: var(--bm-text-secondary); margin-bottom: 0.75rem;">${rec.description}</p>
                                    <button class="bm-btn bm-btn-ghost" style="font-size: 0.75rem;">${rec.action}</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════════
// PHASE 4: MISSING ITC RECOVERY SYSTEM - INTELLIGENT CLAIM TRACKER
// ═══════════════════════════════════════════════════════════════════════════════════


module.exports = TaxRateErrorDetector;
