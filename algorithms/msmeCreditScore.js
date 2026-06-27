/**
 * MSME CreditBridge AI — Deterministic Credit Scoring Engine
 * Implements the TEAA framework: Transparency, Equity, Accountability, Auditability.
 * Numeric score is fully deterministic; no black-box LLM is used for the decision.
 */

const { maskPan, maskAadhaar } = require('../lib/pii');

const FACTOR_WEIGHTS = {
    gstCompliance: 0.25,
    cashFlowStability: 0.30,
    transactionVolume: 0.20,
    digitalAdoption: 0.15,
    creditHistory: 0.10,
};

function normalize(value, min, max) {
    if (max === min) return 1;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function calculateEMI(principal, annualRate, tenureMonths) {
    const r = annualRate / 12 / 100;
    if (r === 0) return principal / tenureMonths;
    const emi = principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
    return Math.round(emi * 100) / 100;
}

function scoreFactor(name, weight, rawScore, maxRaw, impactLabel, icon) {
    const normalized = normalize(rawScore, 0, maxRaw); // 0..1
    const score = Math.round(normalized * 1000);
    const points = Math.round(score * weight);
    return {
        factor: name,
        weight: `${Math.round(weight * 100)}%`,
        score,
        maxScore: 1000,
        impact: impactLabel || (points >= 0 ? `+${points}` : `${points}`),
        icon,
    };
}

function generateFraudSignals(input) {
    const signals = [];
    if (input.gstin && input.gstin.length !== 15) {
        signals.push({ type: 'gst', message: 'GSTIN format appears invalid.', severity: 'high' });
    }
    if (input.annualTurnover > 0 && input.requestedAmount > input.annualTurnover * 0.5) {
        signals.push({ type: 'amount', message: 'Requested amount exceeds 50% of stated annual turnover.', severity: 'medium' });
    }
    if (input.employees && input.employees < 1 && input.annualTurnover > 5000000) {
        signals.push({ type: 'identity', message: 'High turnover with zero reported employees.', severity: 'medium' });
    }
    if (input.enterpriseType === 'micro' && input.requestedAmount > 1000000) {
        signals.push({ type: 'size', message: 'Micro enterprise requesting above typical MUDRA/CGTMSE micro limit.', severity: 'low' });
    }
    return signals;
}

function generateELI5(score, factors, decision) {
    const strong = factors.filter((f) => f.score >= 750).map((f) => f.factor);
    const weak = factors.filter((f) => f.score < 550).map((f) => f.factor);
    let text = '';
    if (decision === 'APPROVED' || decision === 'APPROVED_WITH_CONDITIONS') {
        text = `Your business scored ${score}/1000, which is in the ${decision.replace(/_/g, ' ').toLowerCase()} range. `;
        if (strong.length) text += `Strong areas: ${strong.join(', ')}. `;
        if (weak.length) text += `To improve further, work on: ${weak.join(', ')}.`;
    } else {
        text = `Your business scored ${score}/1000, which is below our current approval threshold. `;
        if (weak.length) text += `Main reasons: ${weak.join(', ')}. `;
        text += 'Follow the improvement roadmap and reapply in 3–6 months.';
    }
    return text;
}

function generateRecommendations(factors) {
    const recs = [];
    const byName = Object.fromEntries(factors.map((f) => [f.factor, f]));
    if (byName.digitalAdoption && byName.digitalAdoption.score < 650) {
        recs.push({ action: 'Increase digital transactions to 70%+', impact: '+80 points', timeline: '6 months', priority: 'HIGH' });
    }
    if (byName.gstCompliance && byName.gstCompliance.score < 800) {
        recs.push({ action: 'File GST returns 5 days before due date', impact: '+40 points', timeline: '3 months', priority: 'MEDIUM' });
    }
    if (byName.cashFlowStability && byName.cashFlowStability.score < 700) {
        recs.push({ action: 'Maintain 3-month average balance', impact: '+60 points', timeline: '4 months', priority: 'HIGH' });
    }
    if (byName.creditHistory && byName.creditHistory.score < 500) {
        recs.push({ action: 'Take a small ticket loan and repay on time', impact: '+50 points', timeline: '6 months', priority: 'MEDIUM' });
    }
    if (recs.length === 0) {
        recs.push({ action: 'Continue consistent GST filing and digital collections', impact: '+30 points', timeline: '3 months', priority: 'LOW' });
    }
    return recs;
}

function determineCategory(score) {
    if (score >= 800) return 'LOW_RISK';
    if (score >= 650) return 'MODERATE_RISK';
    if (score >= 500) return 'ELEVATED_RISK';
    return 'HIGH_RISK';
}

function determineDecision(category, fraudSignals) {
    const critical = fraudSignals.some((s) => s.severity === 'high');
    if (critical) return 'REJECTED';
    if (category === 'LOW_RISK') return 'APPROVED';
    if (category === 'MODERATE_RISK') return 'APPROVED_WITH_CONDITIONS';
    if (category === 'ELEVATED_RISK') return 'PARTIAL_APPROVAL';
    return 'REJECTED';
}

function generateConditions(decision, requestedAmount, score) {
    if (decision === 'APPROVED') {
        return [
            `Interest rate: 11.5% p.a.`,
            'Quarterly financial review mandatory',
            'Auto-debit from primary account required',
        ];
    }
    if (decision === 'APPROVED_WITH_CONDITIONS') {
        const rate = score >= 700 ? 12.5 : 13.5;
        return [
            `Interest rate: ${rate}% p.a. (base 11.5%)`,
            `Loan amount up to ₹${Math.round(requestedAmount).toLocaleString('en-IN')}`,
            'Quarterly financial review mandatory',
            'Auto-debit from primary account required',
        ];
    }
    if (decision === 'PARTIAL_APPROVAL') {
        return [
            `Sanction limited to 70% of requested amount`,
            'Interest rate: 14.5% p.a.',
            'Personal guarantee required',
            'Monthly financial monitoring',
        ];
    }
    return [
        'Application does not meet current risk threshold',
        'Improvement roadmap provided',
        'Reapply after 3–6 months',
    ];
}

function buildOffers(input, score, decision) {
    const principal = decision === 'PARTIAL_APPROVAL' ? Math.round(input.requestedAmount * 0.7) : input.requestedAmount;
    const tenure = input.requestedTenure || 24;

    let rate = 11.5;
    if (decision === 'APPROVED_WITH_CONDITIONS') rate = score >= 700 ? 12.5 : 13.5;
    if (decision === 'PARTIAL_APPROVAL') rate = 14.5;
    if (decision === 'REJECTED') return [];

    const emi = calculateEMI(principal, rate, tenure);
    const totalRepayment = emi * tenure;
    const totalInterest = totalRepayment - principal;
    const processingFee = principal * 0.01;
    const gstOnFees = processingFee * 0.18;

    const cgtmseApplicable = principal <= 5000000; // CGTMSE covers up to ₹5 crore but demo focuses on small ticket
    const cgtmsePercent = principal <= 2000000 ? 85 : 75;
    const guaranteedAmount = principal * (cgtmsePercent / 100);

    const primary = {
        offerType: 'primary',
        principalAmount: principal,
        interestRate: rate,
        tenureMonths: tenure,
        emiAmount: emi,
        totalInterest,
        totalRepayment,
        processingFee,
        gstOnFees,
        cgtmseApplicable,
        cgtmseGuaranteePercent: cgtmsePercent,
        cgtmseGuaranteedAmount: Math.round(guaranteedAmount),
        collateralRequired: false,
        conditions: generateConditions(decision, principal, score),
    };

    const longerTenure = tenure + 12;
    const lowerEmi = calculateEMI(principal, rate, longerTenure);
    const lowerOption = {
        offerType: 'lower-emi',
        principalAmount: principal,
        interestRate: rate,
        tenureMonths: longerTenure,
        emiAmount: lowerEmi,
        totalInterest: lowerEmi * longerTenure - principal,
        totalRepayment: lowerEmi * longerTenure,
        processingFee,
        gstOnFees,
        cgtmseApplicable,
        cgtmseGuaranteePercent: cgtmsePercent,
        cgtmseGuaranteedAmount: Math.round(guaranteedAmount),
        collateralRequired: false,
        conditions: [...primary.conditions, 'Longer tenure increases total interest'],
    };

    return [primary, lowerOption];
}

/**
 * Main scoring function.
 * @param {object} input - MSME application data.
 * @returns {object} scoring result with decision, offers, and XAI metadata.
 */
function assessApplication(input) {
    const gstCompliance = input.gstComplianceScore ?? 85;
    const cashFlowStability = input.cashFlowStabilityScore ?? 72;
    const transactionVolume = input.transactionVolumeScore ?? 65;
    const digitalAdoption = input.digitalAdoptionScore ?? 58;
    const creditHistory = input.creditHistoryScore ?? 40;

    const factors = [
        scoreFactor('GST Compliance', FACTOR_WEIGHTS.gstCompliance, gstCompliance, 100, null, '✅'),
        scoreFactor('Cash Flow Stability', FACTOR_WEIGHTS.cashFlowStability, cashFlowStability, 100, null, '✅'),
        scoreFactor('Transaction Volume', FACTOR_WEIGHTS.transactionVolume, transactionVolume, 100, null, '⚠️'),
        scoreFactor('Digital Adoption', FACTOR_WEIGHTS.digitalAdoption, digitalAdoption, 100, null, '⚠️'),
        scoreFactor('Credit History', FACTOR_WEIGHTS.creditHistory, creditHistory, 100, null, '❌'),
    ];

    const score = Math.min(1000, Math.max(0, factors.reduce((sum, f) => {
        const points = parseInt(f.impact, 10);
        return sum + (isNaN(points) ? 0 : points);
    }, 0)));

    const category = determineCategory(score);
    const fraudSignals = generateFraudSignals(input);
    const decision = determineDecision(category, fraudSignals);
    const conditions = generateConditions(decision, input.requestedAmount, score);
    const recommendations = generateRecommendations(factors);
    const eli5 = generateELI5(score, factors, decision);
    const offers = buildOffers(input, score, decision);

    return {
        score,
        category,
        decision,
        factors,
        eli5,
        recommendations,
        fraudSignals,
        conditions,
        offers,
        auditTrail: {
            engineVersion: '1.0.0',
            framework: 'TEAA',
            scoredAt: new Date().toISOString(),
            maskedPan: input.panNumber ? maskPan(input.panNumber) : null,
            maskedAadhaar: input.aadhaarMasked ? maskAadhaar(input.aadhaarMasked) : null,
        },
    };
}

module.exports = {
    assessApplication,
    calculateEMI,
    FACTOR_WEIGHTS,
};
