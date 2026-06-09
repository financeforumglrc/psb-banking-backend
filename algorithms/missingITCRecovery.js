/**
 * PATENT #6: Missing ITC Recovery Predictor v2.0
 * DS Financial Solutions - Proprietary Algorithm
 * Patent Pending - Trade Secret Protected
 */

const MissingITCRecovery = {
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

    // Analyze missing ITC opportunities
    analyzeMissingITC(purchaseData, gstr2bData = []) {
        const results = {
            summary: {
                totalMissingITC: 0,
                invoicesNotInBooks: 0,
                expiringThisMonth: 0,
                expiringNextMonth: 0,
                potentialRecovery: 0
            },
            missingInvoices: [],
            expiringITC: [],
            supplierFollowups: [],
            byMonth: {},
            recommendations: []
        };

        // Find invoices in GSTR-2B but not in books
        const simulatedMissing = this.findMissingInvoices(purchaseData, gstr2bData);
        
        simulatedMissing.forEach((inv, index) => {
            const expiryDate = this.calculateITCExpiry(inv.invoiceDate);
            const daysToExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
            
            const missingInvoice = {
                index: index + 1,
                supplierName: inv.supplierName,
                supplierGstin: inv.gstin,
                invoiceNo: inv.invoiceNo,
                invoiceDate: inv.invoiceDate,
                taxableValue: inv.taxableValue,
                itcAmount: inv.itcAmount,
                expiryDate: expiryDate,
                daysToExpiry: daysToExpiry,
                urgency: daysToExpiry <= 30 ? 'CRITICAL' : daysToExpiry <= 90 ? 'HIGH' : daysToExpiry <= 180 ? 'MEDIUM' : 'LOW',
                status: 'NOT_RECORDED'
            };

            results.missingInvoices.push(missingInvoice);
            results.summary.totalMissingITC += inv.itcAmount;
            results.summary.invoicesNotInBooks++;

            if (daysToExpiry <= 30) {
                results.summary.expiringThisMonth++;
                results.expiringITC.push(missingInvoice);
            } else if (daysToExpiry <= 60) {
                results.summary.expiringNextMonth++;
                results.expiringITC.push(missingInvoice);
            }

            // Track by month
            const month = new Date(inv.invoiceDate).toLocaleString('default', { month: 'short', year: 'numeric' });
            if (!results.byMonth[month]) {
                results.byMonth[month] = { count: 0, amount: 0 };
            }
            results.byMonth[month].count++;
            results.byMonth[month].amount += inv.itcAmount;

            // Build supplier follow-up list
            const existingSupplier = results.supplierFollowups.find(s => s.gstin === inv.gstin);
            if (existingSupplier) {
                existingSupplier.invoices++;
                existingSupplier.totalITC += inv.itcAmount;
            } else {
                results.supplierFollowups.push({
                    name: inv.supplierName,
                    gstin: inv.gstin,
                    invoices: 1,
                    totalITC: inv.itcAmount
                });
            }
        });

        // Sort by urgency
        results.missingInvoices.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
        results.supplierFollowups.sort((a, b) => b.totalITC - a.totalITC);

        // Calculate potential recovery (80% assumed success rate)
        results.summary.potentialRecovery = results.summary.totalMissingITC * 0.8;

        // Generate recommendations
        results.recommendations = this.generateRecoveryRecommendations(results);

        return results;
    },

    findMissingInvoices(purchaseData, gstr2bData) {
        // Find invoices present in GSTR-2B but missing from purchase data
        if (!gstr2bData || gstr2bData.length === 0) {
            // Without GSTR-2B data, return empty - we cannot detect missing invoices
            return [];
        }
        
        const purchaseKeys = new Set();
        purchaseData.forEach(inv => {
            const gstin = (inv.gstin || inv.GSTIN || inv['Supplier GSTIN'] || '').toUpperCase();
            const invNo = (inv.invoice_no || inv['Invoice No'] || inv.invoiceNo || '').toString().trim().toUpperCase();
            purchaseKeys.add(`${gstin}|${invNo}`);
        });
        
        const missing = [];
        gstr2bData.forEach(gstr => {
            const gstin = (gstr.gstin || gstr.GSTIN || gstr['Supplier GSTIN'] || '').toUpperCase();
            const invNo = (gstr.invoice_no || gstr['Invoice No'] || gstr.invoiceNo || '').toString().trim().toUpperCase();
            const key = `${gstin}|${invNo}`;
            
            if (!purchaseKeys.has(key)) {
                const taxableValue = parseFloat(gstr.taxable_value || gstr['Taxable Value'] || gstr.amount || 0);
                const rate = parseFloat(gstr.rate || gstr.gst_rate || gstr['GST Rate'] || 18);
                missing.push({
                    supplierName: gstr.supplier_name || gstr['Supplier Name'] || 'Unknown Supplier',
                    gstin: gstin,
                    invoiceNo: invNo,
                    invoiceDate: gstr.invoice_date || gstr['Invoice Date'] || gstr.date || '',
                    taxableValue: taxableValue,
                    itcAmount: Math.round(taxableValue * rate / 100)
                });
            }
        });
        
        return missing;
    },

    calculateITCExpiry(invoiceDate) {
        const date = new Date(invoiceDate);
        const fy = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
        return new Date(fy + 2, 8, 30); // September 30 of next FY
    },

    generateRecoveryRecommendations(results) {
        const recommendations = [];

        if (results.summary.expiringThisMonth > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                icon: 'fa-fire',
                title: 'Urgent: ITC Expiring This Month!',
                description: `${results.summary.expiringThisMonth} invoices with ITC of ₹${this.formatMoney(results.expiringITC.filter(i => i.daysToExpiry <= 30).reduce((sum, i) => sum + i.itcAmount, 0))} will expire. Record immediately!`,
                action: 'View Expiring Invoices'
            });
        }

        if (results.supplierFollowups.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                icon: 'fa-envelope',
                title: 'Contact Top Suppliers',
                description: `Contact top ${Math.min(3, results.supplierFollowups.length)} suppliers to verify invoice details and obtain copies for recording.`,
                action: 'Generate Follow-up Emails'
            });
        }

        recommendations.push({
            priority: 'MEDIUM',
            icon: 'fa-sync',
            title: 'Regular 2B Reconciliation',
            description: 'Set up monthly automated reconciliation between GSTR-2B and purchase register to catch missing invoices early.',
            action: 'Configure Auto-Sync'
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
            <div class="bm-missing-itc-results animate__animated animate__fadeIn">
                <!-- Summary Stats -->
                <div class="bm-stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 1.5rem;">
                    <div class="bm-stat-card safe">
                        <div class="bm-stat-icon"><i class="fas fa-coins"></i></div>
                        <div class="bm-stat-value">₹${this.formatMoney(results.summary.totalMissingITC)}</div>
                        <div class="bm-stat-label">Unclaimed ITC Available</div>
                    </div>
                    <div class="bm-stat-card info">
                        <div class="bm-stat-icon"><i class="fas fa-file-invoice"></i></div>
                        <div class="bm-stat-value">${results.summary.invoicesNotInBooks}</div>
                        <div class="bm-stat-label">Invoices Not in Books</div>
                    </div>
                    <div class="bm-stat-card danger">
                        <div class="bm-stat-icon"><i class="fas fa-fire"></i></div>
                        <div class="bm-stat-value">${results.summary.expiringThisMonth}</div>
                        <div class="bm-stat-label">Expiring This Month</div>
                    </div>
                    <div class="bm-stat-card warning">
                        <div class="bm-stat-icon"><i class="fas fa-clock"></i></div>
                        <div class="bm-stat-value">${results.summary.expiringNextMonth}</div>
                        <div class="bm-stat-label">Expiring Next Month</div>
                    </div>
                </div>

                <!-- Expiring ITC Alert -->
                ${results.expiringITC.length > 0 ? `
                    <div class="bm-card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, rgba(255,68,68,0.1), transparent); border-color: rgba(255,68,68,0.3);">
                        <div class="bm-card-header">
                            <div class="bm-card-title" style="color: var(--bm-danger);"><i class="fas fa-fire-alt"></i> ⚠️ Urgently Expiring ITC</div>
                        </div>
                        <div class="bm-table-container" style="max-height: 200px; overflow-y: auto;">
                            <table class="bm-table">
                                <thead>
                                    <tr>
                                        <th>Invoice</th>
                                        <th>Supplier</th>
                                        <th>ITC Amount</th>
                                        <th>Days Left</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${results.expiringITC.slice(0, 10).map(inv => `
                                        <tr style="background: ${inv.daysToExpiry <= 15 ? 'rgba(255,68,68,0.1)' : 'transparent'};">
                                            <td style="font-family: var(--bm-font-mono); font-size: 0.8rem;">${this.escapeHtml(inv.invoiceNo)}</td>
                                            <td>${this.escapeHtml(inv.supplierName.substring(0, 20))}</td>
                                            <td style="font-weight: 600; color: var(--bm-safe);">₹${inv.itcAmount.toLocaleString('en-IN')}</td>
                                            <td>
                                                <span style="color: ${inv.daysToExpiry <= 15 ? 'var(--bm-danger)' : inv.daysToExpiry <= 30 ? 'var(--bm-warning)' : 'var(--bm-caution)'}; font-weight: 600;">
                                                    ${inv.daysToExpiry} days
                                                </span>
                                            </td>
                                            <td>
                                                <button class="bm-btn bm-btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">Record Now</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}

                <!-- Supplier Follow-up List -->
                <div class="bm-card" style="margin-bottom: 1.5rem;">
                    <div class="bm-card-header">
                        <div class="bm-card-title"><i class="fas fa-building"></i> Suppliers to Contact</div>
                        <button class="bm-btn bm-btn-secondary" onclick="generateBulkFollowup()"><i class="fas fa-envelope"></i> Bulk Email</button>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                        ${results.supplierFollowups.slice(0, 6).map(supplier => `
                            <div style="background: var(--bm-bg-secondary); border-radius: 12px; padding: 1rem; border: 1px solid var(--bm-border);">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                                    <div>
                                        <h4 style="font-size: 0.9rem; margin: 0 0 0.25rem;">${this.escapeHtml(supplier.name)}</h4>
                                        <span style="font-size: 0.7rem; font-family: var(--bm-font-mono); color: var(--bm-text-secondary);">${this.escapeHtml(supplier.gstin)}</span>
                                    </div>
                                    <span class="bm-badge" style="background: var(--bm-safe)20; color: var(--bm-safe); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">${supplier.invoices} invoices</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 1.1rem; font-weight: 700; color: var(--bm-neon-cyan);">₹${this.formatMoney(supplier.totalITC)}</span>
                                    <button class="bm-btn bm-btn-ghost" style="font-size: 0.7rem;" onclick="sendSupplierReminder('${this.escapeHtml(supplier.gstin)}')"><i class="fab fa-whatsapp"></i> Remind</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- All Missing Invoices -->
                <div class="bm-card">
                    <div class="bm-card-header">
                        <div class="bm-card-title"><i class="fas fa-list"></i> All Missing Invoices</div>
                        <button class="bm-btn bm-btn-secondary" onclick="exportMissingITC()"><i class="fas fa-download"></i> Export</button>
                    </div>
                    <div class="bm-table-container" style="max-height: 350px; overflow-y: auto;">
                        <table class="bm-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Invoice No</th>
                                    <th>Supplier</th>
                                    <th>Date</th>
                                    <th>ITC Amount</th>
                                    <th>Expiry</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${results.missingInvoices.map(inv => `
                                    <tr>
                                        <td>${inv.index}</td>
                                        <td style="font-family: var(--bm-font-mono); font-size: 0.8rem;">${this.escapeHtml(inv.invoiceNo)}</td>
                                        <td>${this.escapeHtml(inv.supplierName.substring(0, 18))}${inv.supplierName.length > 18 ? '...' : ''}</td>
                                        <td style="font-size: 0.8rem;">${this.escapeHtml(inv.invoiceDate)}</td>
                                        <td style="font-weight: 600;">₹${inv.itcAmount.toLocaleString('en-IN')}</td>
                                        <td style="font-size: 0.8rem; color: ${inv.daysToExpiry <= 30 ? 'var(--bm-danger)' : inv.daysToExpiry <= 90 ? 'var(--bm-warning)' : 'var(--bm-text-secondary)'};">
                                            ${inv.daysToExpiry} days
                                        </td>
                                        <td>
                                            <span class="bm-urgency-badge ${inv.urgency.toLowerCase()}" style="padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.65rem; background: ${inv.urgency === 'CRITICAL' ? 'var(--bm-danger)' : inv.urgency === 'HIGH' ? 'var(--bm-warning)' : inv.urgency === 'MEDIUM' ? 'var(--bm-caution)' : 'var(--bm-safe)'}20; color: ${inv.urgency === 'CRITICAL' ? 'var(--bm-danger)' : inv.urgency === 'HIGH' ? 'var(--bm-warning)' : inv.urgency === 'MEDIUM' ? 'var(--bm-caution)' : 'var(--bm-safe)'};">
                                                ${inv.urgency}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════════
// PHASE 5: SHELL COMPANY AI DETECTOR - MULTI-LAYER FRAUD DETECTION
// ═══════════════════════════════════════════════════════════════════════════════════


module.exports = MissingITCRecovery;
