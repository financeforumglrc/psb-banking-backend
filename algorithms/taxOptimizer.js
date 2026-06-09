/**
 * PATENT #4: Multi-Regime Tax Optimizer v2.0
 * DS Financial Solutions - Proprietary Algorithm
 * Patent Pending - Trade Secret Protected
 */

const TAX_SLABS_NEW = [
    { limit: 300000, rate: 0 },
    { limit: 700000, rate: 0.05 },
    { limit: 1000000, rate: 0.10 },
    { limit: 1200000, rate: 0.15 },
    { limit: 1500000, rate: 0.20 },
    { limit: Infinity, rate: 0.30 }
];

const TAX_SLABS_OLD = [
    { limit: 250000, rate: 0 },
    { limit: 500000, rate: 0.05 },
    { limit: 1000000, rate: 0.20 },
    { limit: Infinity, rate: 0.30 }
];

function formatCurrency(amount) {
    return 'Rs. ' + Math.round(amount).toLocaleString('en-IN');
}

function optimizeTaxes(profile) {
    const results = {
        profile: profile,
        oldRegime: {},
        newRegime: {},
        optimal: {},
        recommendations: [],
        savings: 0,
        confidence: 0
    };
    
    // Calculate Old Regime Tax
    results.oldRegime = calculateOldRegimeTax(profile);
    
    // Calculate New Regime Tax
    results.newRegime = calculateNewRegimeTax(profile);
    
    // Determine optimal regime
    results.optimal = results.oldRegime.totalTax < results.newRegime.totalTax ? 
                     { ...results.oldRegime, regime: 'Old Regime' } : 
                     { ...results.newRegime, regime: 'New Regime' };
    
    // Generate recommendations
    results.recommendations = generateRecommendations(profile, results.optimal);
    
    // Calculate potential savings
    results.savings = calculatePotentialSavings(profile, results.recommendations);
    
    // Calculate confidence score
    results.confidence = calculateConfidenceScore(profile, results.recommendations);
    
    return results;
}

function calculateOldRegimeTax(profile) {
    const income = profile.income;
    const currentInvestments = profile.currentInvestments;
    const rent = profile.rent;
    
    // Calculate deductions
    let deductions = 0;
    
    // Standard Deduction
    const standardDeduction = 50000;
    deductions += standardDeduction;
    
    // 80C Deduction
    const section80C = Math.min(currentInvestments, 150000);
    deductions += section80C;
    
    // HRA Calculation
    const hra = calculateHRA(profile);
    deductions += hra;
    
    // Professional Tax
    const professionalTax = 2400;
    deductions += professionalTax;
    
    // Taxable Income
    const taxableIncome = Math.max(0, income - deductions);
    
    // Calculate Tax
    let tax = 0;
    let prevLimit = 0;
    
    for (const slab of TAX_SLABS_OLD) {
        if (taxableIncome > prevLimit) {
            const taxableInSlab = Math.min(taxableIncome, slab.limit) - prevLimit;
            tax += taxableInSlab * slab.rate;
            prevLimit = slab.limit;
        } else {
            break;
        }
    }
    
    // Add Cess
    const cess = tax * 0.04;
    const totalTax = tax + cess;
    
    return {
        regime: 'Old Regime',
        grossIncome: income,
        deductions: deductions,
        taxableIncome: taxableIncome,
        tax: tax,
        cess: cess,
        totalTax: totalTax,
        effectiveRate: (totalTax / income * 100).toFixed(2)
    };
}

function calculateNewRegimeTax(profile) {
    const income = profile.income;
    
    // New regime has no deductions except standard deduction
    const standardDeduction = 50000; // Updated for FY 2025-26
    const taxableIncome = Math.max(0, income - standardDeduction);
    
    // Calculate Tax
    let tax = 0;
    let prevLimit = 0;
    
    for (const slab of TAX_SLABS_NEW) {
        if (taxableIncome > prevLimit) {
            const taxableInSlab = Math.min(taxableIncome, slab.limit) - prevLimit;
            tax += taxableInSlab * slab.rate;
            prevLimit = slab.limit;
        } else {
            break;
        }
    }
    
    // Add Cess
    const cess = tax * 0.04;
    const totalTax = tax + cess;
    
    return {
        regime: 'New Regime',
        grossIncome: income,
        deductions: standardDeduction,
        taxableIncome: taxableIncome,
        tax: tax,
        cess: cess,
        totalTax: totalTax,
        effectiveRate: (totalTax / income * 100).toFixed(2)
    };
}

function calculateHRA(profile) {
    if (!profile.rent || profile.rent === 0) return 0;
    if (!profile.hraReceived || profile.hraReceived === 0) return 0;
    
    // profile.rent is annual rent paid (as passed from route: rentPaid * 12)
    // profile.hraReceived is annual HRA received
    const annualRent = profile.rent;
    const annualHRA = profile.hraReceived;
    const basicSalary = profile.basicSalary || profile.income * 0.5;
    const isMetro = profile.cityType === 'metro';
    
    // HRA exemption is minimum of:
    // 1. Actual HRA received
    // 2. Rent paid minus 10% of basic salary
    // 3. 50% of basic salary (metro) or 40% (non-metro)
    
    const rentMinus10 = annualRent - (basicSalary * 0.1);
    const cityLimit = basicSalary * (isMetro ? 0.5 : 0.4);
    
    return Math.max(0, Math.min(annualHRA, rentMinus10, cityLimit));
}

/**
 * ADVANCED RECOMMENDATION ENGINE
 * Uses priority scoring and optimization algorithms
 */
function generateRecommendations(profile, optimal) {
    const recommendations = [];
    const income = profile.income;
    const currentInvestments = profile.currentInvestments;
    const priority = profile.priority;
    
    // Only generate recommendations for old regime or if savings are significant
    if (optimal.regime === 'Old Regime' || optimal.totalTax > 100000) {
        
        // 1. Maximize 80C if not already maxed out
        if (currentInvestments < 150000) {
            const remaining80C = 150000 - currentInvestments;
            // Calculate marginal tax rate based on taxable income
            const marginalRate = calculateMarginalTaxRate(income);
            const taxSaved = remaining80C * marginalRate;
            
            recommendations.push({
                id: '80c_maximize',
                title: 'Maximize Section 80C Investments',
                description: `Invest additional ₹${formatCurrency(remaining80C)} in tax-saving instruments like ELSS, PPF, or NPS to fully utilize 80C limit`,
                category: 'Investment',
                priority: 10,
                savings: taxSaved,
                effort: 'easy',
                icon: 'fa-piggy-bank',
                action: 'Invest Now',
                details: getTop80COptions(remaining80C, priority)
            });
        }
        
        // 2. NPS Additional Deduction (80CCD(1B))
        const npsAdditional = 50000;
        const marginalRate = calculateMarginalTaxRate(income);
        const npsSavings = npsAdditional * marginalRate;
        
        recommendations.push({
            id: 'nps_additional',
            title: 'Additional NPS Contribution (80CCD1B)',
            description: `Invest ₹${formatCurrency(npsAdditional)} in NPS for additional tax deduction beyond 80C limit`,
            category: 'Retirement',
            priority: 9,
            savings: npsSavings,
            effort: 'easy',
            icon: 'fa-umbrella',
            action: 'Start NPS',
            details: ['7-9% returns', 'Tax benefit at withdrawal', 'Retirement corpus building']
        });
        
        // 3. Health Insurance (80D)
        const healthInsurance = profile.age >= 60 ? 50000 : 25000;
        const healthSavings = healthInsurance * marginalRate;
        
        recommendations.push({
            id: 'health_insurance',
            title: 'Health Insurance Premium (80D)',
            description: `Get health insurance coverage and save up to ₹${formatCurrency(healthInsurance)} in taxes`,
            category: 'Insurance',
            priority: 8,
            savings: healthSavings,
            effort: 'medium',
            icon: 'fa-heartbeat',
            action: 'Get Quote',
            details: [`₹${formatCurrency(healthInsurance * 20)} coverage`, 'Cashless hospitalization', 'Tax benefits']
        });
        
        // 4. Home Loan Interest (Section 24)
        if (income > 800000) {
            const homeLoanInterest = 200000;
            const homeLoanSavings = homeLoanInterest * marginalRate;
            
            recommendations.push({
                id: 'home_loan',
                title: 'Home Loan Interest Deduction (Section 24)',
                description: `If you have a home loan, claim up to ₹${formatCurrency(homeLoanInterest)} interest deduction`,
                category: 'Property',
                priority: 7,
                savings: homeLoanSavings,
                effort: 'easy',
                icon: 'fa-home',
                action: 'Calculate',
                details: ['Own home loan', 'Self-occupied property', 'Claim interest paid']
            });
        }
        
        // 5. Education Loan Interest (80E)
        if (profile.age < 35) {
            recommendations.push({
                id: 'education_loan',
                title: 'Education Loan Interest Deduction (80E)',
                description: 'Full deduction on interest paid for education loans (self, spouse, children)',
                category: 'Education',
                priority: 6,
                savings: 15000,
                effort: 'easy',
                icon: 'fa-graduation-cap',
                action: 'Learn More',
                details: ['No upper limit', '8 years benefit', 'Higher education']
            });
        }
        
        // 6. Donations (80G)
        const donation = income * 0.02; // Suggest 2% of income
        const donationSavings = donation * 0.5 * 0.3; // 50% or 100% eligible
        
        recommendations.push({
            id: 'donations',
            title: 'Charitable Donations (80G)',
            description: `Donate ₹${formatCurrency(donation)} to eligible institutions and get tax benefits`,
            category: 'Social',
            priority: 5,
            savings: donationSavings,
            effort: 'easy',
            icon: 'fa-hand-holding-heart',
            action: 'Find NGOs',
            details: ['50-100% deduction', 'Eligible institutions', 'Social impact']
        });
        
        // 7. Leave Travel Allowance (LTA)
        if (profile.employmentType === 'salaried') {
            recommendations.push({
                id: 'lta',
                title: 'Leave Travel Allowance Exemption',
                description: 'Claim LTA exemption for domestic travel expenses (2 journeys in 4 years)',
                category: 'Allowance',
                priority: 4,
                savings: 20000,
                effort: 'medium',
                icon: 'fa-plane',
                action: 'Plan Travel',
                details: ['Domestic travel only', 'Actual expenses', 'Keep tickets & bills']
            });
        }
        
        // 8. Meal Vouchers
        if (profile.employmentType === 'salaried') {
            const mealVouchers = 26400; // ₹2200 per month
            const mealSavings = mealVouchers * 0.3;
            
            recommendations.push({
                id: 'meal_vouchers',
                title: 'Meal Vouchers / Food Coupons',
                description: `Get ₹${formatCurrency(mealVouchers)} per year tax-free through meal vouchers`,
                category: 'Allowance',
                priority: 3,
                savings: mealSavings,
                effort: 'easy',
                icon: 'fa-utensils',
                action: 'Apply',
                details: ['₹2,200 per month', 'Tax-free', 'Ask your employer']
            });
        }
        
        // 9. Professional Development
        if (profile.employmentType === 'salaried') {
            recommendations.push({
                id: 'professional_dev',
                title: 'Professional Development Reimbursement',
                description: 'Claim reimbursement for books, journals, and professional development',
                category: 'Development',
                priority: 2,
                savings: 5000,
                effort: 'easy',
                icon: 'fa-book-reader',
                action: 'Learn More',
                details: ['Books & journals', 'Online courses', 'Professional subscriptions']
            });
        }
        
        // 10. Regime Switch Recommendation
        if (optimal.regime === 'Old Regime' && currentInvestments < 50000) {
            recommendations.push({
                id: 'regime_switch',
                title: 'Consider New Tax Regime',
                description: 'With low deductions, new regime might be more beneficial. Review annually.',
                category: 'Strategy',
                priority: 1,
                savings: 0,
                effort: 'easy',
                icon: 'fa-exchange-alt',
                action: 'Compare',
                details: ['Lower tax rates', 'No complex planning', 'Simpler filing']
            });
        }
    } else {
        // For new regime users
        recommendations.push({
            id: 'new_regime_optimal',
            title: 'Your New Regime Selection is Optimal',
            description: 'Based on your profile, the new tax regime offers the best tax efficiency',
            category: 'Strategy',
            priority: 10,
            savings: 0,
            effort: 'none',
            icon: 'fa-check-circle',
            action: 'Continue',
            details: ['Lower tax rates', 'Simplified filing', 'No deduction tracking']
        });
        
        // Still recommend health insurance and NPS for financial security
        recommendations.push({
            id: 'health_insurance',
            title: 'Health Insurance (Financial Security)',
            description: 'While no tax benefit in new regime, health insurance is crucial for financial protection',
            category: 'Insurance',
            priority: 9,
            savings: 0,
            effort: 'medium',
            icon: 'fa-heartbeat',
            action: 'Get Coverage',
            details: ['Medical emergencies', 'Financial protection', 'Peace of mind']
        });
    }
    
    // Sort by priority and savings
    recommendations.sort((a, b) => {
        if (priority === 'maximize') {
            return b.savings - a.savings;
        } else {
            return b.priority - a.priority;
        }
    });
    
    return recommendations.slice(0, 8); // Return top 8 recommendations
}

const TAX_INSTRUMENTS = {
    section80C: {
        limit: 150000,
        options: [
            { name: 'Public Provident Fund (PPF)', rate: 0.071, risk: 'low', liquidity: 'low', priority: 10 },
            { name: 'Equity Linked Savings Scheme (ELSS)', rate: 0.12, risk: 'medium', liquidity: 'medium', priority: 9 },
            { name: 'National Pension System (NPS)', rate: 0.09, risk: 'low', liquidity: 'low', priority: 8 },
            { name: 'Life Insurance Premium', rate: 0.06, risk: 'low', liquidity: 'low', priority: 7 },
            { name: '5-Year Fixed Deposit', rate: 0.065, risk: 'low', liquidity: 'low', priority: 6 },
            { name: 'Sukanya Samriddhi Yojana', rate: 0.08, risk: 'low', liquidity: 'low', priority: 5 }
        ]
    }
};

function getTop80COptions(amount, priority) {
    const options = TAX_INSTRUMENTS.section80C.options;
    
    if (priority === 'maximize') {
        // Prioritize by returns
        return options
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 3)
            .map(opt => `${opt.name} (${(opt.rate * 100).toFixed(1)}% returns)`);
    } else if (priority === 'conservative') {
        // Prioritize by safety
        return options
            .filter(opt => opt.risk === 'low')
            .slice(0, 3)
            .map(opt => `${opt.name} (${(opt.rate * 100).toFixed(1)}% returns)`);
    } else {
        // Balanced
        return options
            .slice(0, 3)
            .map(opt => `${opt.name} (${(opt.rate * 100).toFixed(1)}% returns)`);
    }
}

function calculateMarginalTaxRate(income) {
    // Old regime slabs for FY 2025-26
    if (income <= 250000) return 0;
    if (income <= 500000) return 0.05;
    if (income <= 1000000) return 0.20;
    return 0.30;
}

function calculatePotentialSavings(profile, recommendations) {
    return recommendations.reduce((total, rec) => total + rec.savings, 0);
}

function calculateConfidenceScore(profile, recommendations) {
    // Confidence based on:
    // 1. Profile completeness
    // 2. Number of actionable recommendations
    // 3. Income level (more data for common brackets)
    
    let score = 85; // Base score
    
    // Profile completeness
    if (profile.rent > 0) score += 3;
    if (profile.currentInvestments > 0) score += 3;
    
    // Recommendations
    if (recommendations.length >= 6) score += 5;
    
    // Income bracket (most data for 5L-20L)
    if (profile.income >= 500000 && profile.income <= 2000000) {
        score += 4;
    }
    
    return Math.min(100, score);
}

/**
 * RESULTS DISPLAY ENGINE WITH ADVANCED FEATURES
 */

module.exports = { optimizeTaxes, calculateOldRegimeTax, calculateNewRegimeTax, generateRecommendations, calculateHRA };
