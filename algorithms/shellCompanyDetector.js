/**
 * PATENT #3: Shell Company Detector v2.0
 * DS Financial Solutions - Proprietary Algorithm
 * Patent Pending - Trade Secret Protected
 */

const ShellCompanyDetector = {
    // HTML escape helper to prevent XSS
    escapeHtml(unsafe) {
        if (unsafe == null) return '';
        if (typeof unsafe !== 'string') unsafe = String(unsafe);
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // Risk indicators and weights
    riskIndicators: {
        NEW_REGISTRATION: { weight: 25, label: 'New Registration (<6 months)', icon: 'fa-calendar-xmark' },
        RESIDENTIAL_ADDRESS: { weight: 20, label: 'Residential Address', icon: 'fa-home' },
        HIGH_VALUE_LOW_FREQ: { weight: 30, label: 'High Value, Low Frequency', icon: 'fa-chart-line' },
        NO_RETURN_FILING: { weight: 35, label: 'No Return Filing', icon: 'fa-file-slash' },
        MISMATCHED_BUSINESS: { weight: 15, label: 'Mismatched Business Type', icon: 'fa-industry' },
        MULTIPLE_GSTIN_SAME_PAN: { weight: 20, label: 'Multiple GSTIN Same PAN', icon: 'fa-clone' },
        CIRCULAR_TRANSACTIONS: { weight: 40, label: 'Circular Transactions', icon: 'fa-sync' },
        ROUND_FIGURE_INVOICES: { weight: 10, label: 'Round Figure Invoices', icon: 'fa-bullseye' },
        MONTH_END_CONCENTRATION: { weight: 15, label: 'Month-End Invoice Spike', icon: 'fa-calendar-day' },
        CANCELLED_STATUS: { weight: 50, label: 'Cancelled GSTIN', icon: 'fa-ban' },
        BLACKLISTED: { weight: 100, label: 'Blacklisted (Fake Invoice)', icon: 'fa-skull' }
    },

    // Analyze suppliers for shell company indicators
    analyzeSuppliers(data) {
        const results = {
            summary: {
                totalSuppliers: 0,
                highRisk: 0,
                mediumRisk: 0,
                lowRisk: 0,
                safe: 0,
                totalAtRiskAmount: 0
            },
            suspiciousSuppliers: [],
            riskDistribution: {},
            patternAlerts: [],
            recommendations: []
        };

        // Extract unique suppliers
        const supplierMap = new Map();
        data.forEach(invoice => {
            const gstin = invoice.gstin || invoice.GSTIN || invoice['Supplier GSTIN'] || '';
            if (!gstin) return;

            if (!supplierMap.has(gstin)) {
                supplierMap.set(gstin, {
                    gstin: gstin,
                    name: invoice.supplier_name || invoice['Supplier Name'] || 'Unknown',
                    invoices: [],
                    totalValue: 0,
                    riskIndicators: [],
                    riskScore: 0
                });
            }

            const supplier = supplierMap.get(gstin);
            supplier.invoices.push(invoice);
            supplier.totalValue += parseFloat(invoice.taxable_value || invoice['Taxable Value'] || invoice.amount || 0);
        });

        // Analyze each supplier
        supplierMap.forEach((supplier, gstin) => {
            results.summary.totalSuppliers++;
            
            // Run risk checks
            supplier.riskIndicators = this.checkRiskIndicators(supplier);
            supplier.riskScore = supplier.riskIndicators.reduce((sum, ind) => sum + ind.weight, 0);
            
            // Classify risk level
            if (supplier.riskScore >= 70) {
                supplier.riskLevel = 'HIGH';
                results.summary.highRisk++;
                results.summary.totalAtRiskAmount += supplier.totalValue;
            } else if (supplier.riskScore >= 40) {
                supplier.riskLevel = 'MEDIUM';
                results.summary.mediumRisk++;
                results.summary.totalAtRiskAmount += supplier.totalValue * 0.5;
            } else if (supplier.riskScore >= 15) {
                supplier.riskLevel = 'LOW';
                results.summary.lowRisk++;
            } else {
                supplier.riskLevel = 'SAFE';
                results.summary.safe++;
            }

            if (supplier.riskScore >= 15) {
                results.suspiciousSuppliers.push(supplier);
            }
        });

        // Sort by risk score
        results.suspiciousSuppliers.sort((a, b) => b.riskScore - a.riskScore);

        // Generate pattern alerts
        results.patternAlerts = this.detectPatterns(results.suspiciousSuppliers);

        // Generate recommendations
        results.recommendations = this.generateShellDetectionRecommendations(results);

        return results;
    },

    checkRiskIndicators(supplier) {
        const indicators = [];

        // Check GSTIN format and extract info
        const gstin = supplier.gstin;
        
        // Check for round figure invoices (suspicious)
        const roundFigureCount = supplier.invoices.filter(inv => {
            const amount = parseFloat(inv.taxable_value || inv['Taxable Value'] || inv.amount || 0);
            return amount % 10000 === 0 && amount > 50000;
        }).length;
        
        if (roundFigureCount > supplier.invoices.length * 0.5) {
            indicators.push({ ...this.riskIndicators.ROUND_FIGURE_INVOICES, count: roundFigureCount });
        }

        // Check for month-end concentration
        const monthEndCount = supplier.invoices.filter(inv => {
            const dateStr = inv.invoice_date || inv['Invoice Date'] || inv.date;
            if (!dateStr) return false;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return false;
            return date.getDate() >= 28;
        }).length;

        if (monthEndCount > supplier.invoices.length * 0.6) {
            indicators.push({ ...this.riskIndicators.MONTH_END_CONCENTRATION, count: monthEndCount });
        }

        // Check for high value low frequency (suspicious pattern)
        const avgInvoiceValue = supplier.totalValue / supplier.invoices.length;
        if (avgInvoiceValue > 500000 && supplier.invoices.length < 5) {
            indicators.push({ ...this.riskIndicators.HIGH_VALUE_LOW_FREQ, avgValue: avgInvoiceValue });
        }

        // Check for circular transactions (same amount appearing multiple times)
        const amountCounts = {};
        supplier.invoices.forEach(inv => {
            const amount = parseFloat(inv.taxable_value || inv['Taxable Value'] || inv.amount || 0);
            const rounded = Math.round(amount / 1000) * 1000;
            amountCounts[rounded] = (amountCounts[rounded] || 0) + 1;
        });
        const hasCircular = Object.values(amountCounts).some(c => c >= 3);
        if (hasCircular) {
            indicators.push(this.riskIndicators.CIRCULAR_TRANSACTIONS);
        }

        // Deterministic check for mismatched business type based on GSTIN entity code
        if (gstin && gstin.length >= 14) {
            const entityCode = gstin[5]; // 6th char of GSTIN (4th char of PAN)
            const entityNature = supplier.invoices[0]?.nature_of_business || supplier.invoices[0]?.businessType;
            if (entityNature) {
                // Entity code 'C' should be Company, 'P' should be Individual, etc.
                const mismatches = {
                    'C': ['proprietorship', 'individual', 'huf'],
                    'P': ['company', 'llp', 'partnership'],
                    'F': ['company', 'individual'],
                    'H': ['company', 'llp', 'partnership']
                };
                const nature = entityNature.toString().toLowerCase();
                if (mismatches[entityCode] && mismatches[entityCode].some(m => nature.includes(m))) {
                    indicators.push(this.riskIndicators.MISMATCHED_BUSINESS);
                }
            }
        }

        // NOTE: BLACKLISTED and CANCELLED_STATUS require external API verification
        // They are NOT assigned deterministically to avoid false positives
        // In production, integrate with GSTN API for real-time status checks

        return indicators;
    },

    detectPatterns(suppliers) {
        const alerts = [];

        // Check for suppliers with same PAN
        const panMap = new Map();
        suppliers.forEach(s => {
            const pan = s.gstin.substring(2, 12);
            if (!panMap.has(pan)) {
                panMap.set(pan, []);
            }
            panMap.get(pan).push(s);
        });

        panMap.forEach((suppliers, pan) => {
            if (suppliers.length > 1) {
                alerts.push({
                    type: 'MULTI_GSTIN_PATTERN',
                    severity: 'HIGH',
                    message: `${suppliers.length} suppliers share PAN ${pan}. Possible related party or shell network.`,
                    suppliers: suppliers.map(s => s.gstin)
                });
            }
        });

        // Check for concentration by state (unusual)
        const stateMap = new Map();
        suppliers.forEach(s => {
            const state = s.gstin.substring(0, 2);
            if (!stateMap.has(state)) {
                stateMap.set(state, 0);
            }
            stateMap.set(state, stateMap.get(state) + 1);
        });

        stateMap.forEach((count, state) => {
            if (count > suppliers.length * 0.5 && suppliers.length > 5) {
                alerts.push({
                    type: 'STATE_CONCENTRATION',
                    severity: 'MEDIUM',
                    message: `${count} suspicious suppliers from state code ${state}. Possible coordinated network.`,
                    state: state
                });
            }
        });

        return alerts;
    },

    generateShellDetectionRecommendations(results) {
        const recommendations = [];

        if (results.summary.highRisk > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                icon: 'fa-skull-crossbones',
                title: 'Stop Transactions with High-Risk Suppliers',
                description: `${results.summary.highRisk} suppliers flagged as potential shell companies. ITC claims worth ₹${this.formatMoney(results.summary.totalAtRiskAmount)} at risk.`,
                action: 'Block & Review'
            });
        }

        if (results.patternAlerts.some(a => a.type === 'MULTI_GSTIN_PATTERN')) {
            recommendations.push({
                priority: 'HIGH',
                icon: 'fa-project-diagram',
                title: 'Investigate Related Party Network',
                description: 'Multiple suppliers sharing same PAN detected. Investigate for circular transactions and related party dealings.',
                action: 'View Network Map'
            });
        }

        recommendations.push({
            priority: 'MEDIUM',
            icon: 'fa-search',
            title: 'Verify Supplier Details',
            description: 'Cross-verify supplier details with official GST portal before new transactions.',
            action: 'Bulk GSTIN Verify'
        });

        return recommendations;
    },

    formatMoney(amount) {
        if (amount >= 10000000) return (amount / 10000000).toFixed(2) + ' Cr';
        if (amount >= 100000) return (amount / 100000).toFixed(2) + ' L';
        return amount.toLocaleString('en-IN');
    },

    generateHTML(results) {
        return `
            <div class="bm-shell-detect-results animate__animated animate__fadeIn">
                <!-- Risk Summary -->
                <div class="bm-stats-grid" style="grid-template-columns: repeat(5, 1fr); margin-bottom: 1.5rem;">
                    <div class="bm-stat-card">
                        <div class="bm-stat-icon"><i class="fas fa-building"></i></div>
                        <div class="bm-stat-value">${results.summary.totalSuppliers}</div>
                        <div class="bm-stat-label">Total Suppliers</div>
                    </div>
                    <div class="bm-stat-card danger">
                        <div class="bm-stat-icon"><i class="fas fa-skull"></i></div>
                        <div class="bm-stat-value">${results.summary.highRisk}</div>
                        <div class="bm-stat-label">High Risk</div>
                    </div>
                    <div class="bm-stat-card warning">
                        <div class="bm-stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
                        <div class="bm-stat-value">${results.summary.mediumRisk}</div>
                        <div class="bm-stat-label">Medium Risk</div>
                    </div>
                    <div class="bm-stat-card info">
                        <div class="bm-stat-icon"><i class="fas fa-info-circle"></i></div>
                        <div class="bm-stat-value">${results.summary.lowRisk}</div>
                        <div class="bm-stat-label">Low Risk</div>
                    </div>
                    <div class="bm-stat-card safe">
                        <div class="bm-stat-icon"><i class="fas fa-shield-check"></i></div>
                        <div class="bm-stat-value">${results.summary.safe}</div>
                        <div class="bm-stat-label">Safe</div>
                    </div>
                </div>

                <!-- Pattern Alerts -->
                ${results.patternAlerts.length > 0 ? `
                    <div class="bm-card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, rgba(255,68,68,0.1), transparent); border-color: rgba(255,68,68,0.3);">
                        <div class="bm-card-header">
                            <div class="bm-card-title" style="color: var(--bm-danger);"><i class="fas fa-radar"></i> Pattern Detection Alerts</div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${results.patternAlerts.map(alert => `
                                <div style="display: flex; align-items: start; gap: 0.75rem; padding: 0.75rem; background: rgba(255,68,68,0.05); border-radius: 8px; border-left: 3px solid ${alert.severity === 'HIGH' ? 'var(--bm-danger)' : 'var(--bm-warning)'};">
                                    <i class="fas fa-exclamation-circle" style="color: ${alert.severity === 'HIGH' ? 'var(--bm-danger)' : 'var(--bm-warning)'}; margin-top: 2px;"></i>
                                    <div>
                                        <span style="font-size: 0.85rem; font-weight: 500;">${this.escapeHtml(alert.message)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Suspicious Suppliers -->
                <div class="bm-card">
                    <div class="bm-card-header">
                        <div class="bm-card-title"><i class="fas fa-user-secret"></i> Suspicious Suppliers</div>
                        <button class="bm-btn bm-btn-secondary" onclick="exportShellReport()"><i class="fas fa-download"></i> Export</button>
                    </div>
                    ${results.suspiciousSuppliers.length > 0 ? `
                        <div class="bm-table-container" style="max-height: 400px; overflow-y: auto;">
                            <table class="bm-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Supplier</th>
                                        <th>GSTIN</th>
                                        <th>Total Value</th>
                                        <th>Risk Score</th>
                                        <th>Indicators</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${results.suspiciousSuppliers.map((supplier, idx) => `
                                        <tr style="background: ${supplier.riskLevel === 'HIGH' ? 'rgba(255,68,68,0.1)' : supplier.riskLevel === 'MEDIUM' ? 'rgba(255,215,0,0.1)' : 'transparent'};">
                                            <td>${idx + 1}</td>
                                            <td>${this.escapeHtml(supplier.name.substring(0, 25))}${supplier.name.length > 25 ? '...' : ''}</td>
                                            <td style="font-family: var(--bm-font-mono); font-size: 0.75rem;">${this.escapeHtml(supplier.gstin)}</td>
                                            <td style="font-weight: 600;">₹${this.formatMoney(supplier.totalValue)}</td>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                    <div style="width: 40px; height: 6px; background: var(--bm-bg-tertiary); border-radius: 3px; overflow: hidden;">
                                                        <div style="width: ${Math.min(100, supplier.riskScore)}%; height: 100%; background: ${supplier.riskLevel === 'HIGH' ? 'var(--bm-danger)' : supplier.riskLevel === 'MEDIUM' ? 'var(--bm-warning)' : 'var(--bm-caution)'};"></div>
                                                    </div>
                                                    <span style="font-size: 0.8rem; font-weight: 600; color: ${supplier.riskLevel === 'HIGH' ? 'var(--bm-danger)' : supplier.riskLevel === 'MEDIUM' ? 'var(--bm-warning)' : 'var(--bm-caution)'};">${supplier.riskScore}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                                                    ${supplier.riskIndicators.slice(0, 3).map(ind => `
                                                        <span title="${this.escapeHtml(ind.label)}" style="padding: 0.1rem 0.3rem; background: rgba(255,68,68,0.1); border-radius: 4px; font-size: 0.65rem;">
                                                            <i class="fas ${ind.icon}"></i>
                                                        </span>
                                                    `).join('')}
                                                    ${supplier.riskIndicators.length > 3 ? `<span style="font-size: 0.65rem; color: var(--bm-text-secondary);">+${supplier.riskIndicators.length - 3}</span>` : ''}
                                                </div>
                                            </td>
                                            <td>
                                                <button class="bm-btn bm-btn-ghost" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" onclick="viewSupplierDetails('${this.escapeHtml(supplier.gstin)}')">
                                                    <i class="fas fa-eye"></i> Details
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div style="text-align: center; padding: 3rem;">
                            <i class="fas fa-shield-check" style="font-size: 3rem; color: var(--bm-safe); margin-bottom: 1rem; display: block;"></i>
                            <h3 style="color: var(--bm-safe);">No Suspicious Suppliers Detected!</h3>
                            <p style="color: var(--bm-text-secondary);">All suppliers passed shell company screening.</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════════
// INITIALIZATION & INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════════

// Make modules available globally

module.exports = ShellCompanyDetector;
