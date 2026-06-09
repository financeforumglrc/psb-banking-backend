/**
 * PSB SecureWealth — Comprehensive Banking Routes
 * Accounts, Transactions, Cards, Bills, Goals, Assets, Beneficiaries
 * v2.0 — Atomic transactions, full CRUD, filtering, validation
 */

const express = require('express');
const router = express.Router();
const { bankingDb, db, userDb } = require('../services/database');
const { authMiddleware } = require('../middleware/auth');

// ========== VALIDATION HELPERS ==========
function validateRequired(body, fields) {
    const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
    if (missing.length > 0) return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
    return { valid: true };
}

function validatePositiveNumber(value, name) {
    if (typeof value !== 'number' && typeof value !== 'string') return { valid: false, error: `${name} must be a number` };
    const num = Number(value);
    if (isNaN(num) || num <= 0) return { valid: false, error: `${name} must be a positive number` };
    return { valid: true, value: num };
}

// ========== ACCOUNTS ==========
router.get('/accounts', authMiddleware, (req, res) => {
    try {
        const accounts = bankingDb.getAccountsByUser(req.user.id);
        res.json({ success: true, data: accounts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/accounts', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['accountType']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { accountType, balance, ifsc, branch } = req.body;
        const accNum = 'PSB' + Date.now() + Math.floor(Math.random() * 1000);
        const result = bankingDb.createAccount({
            userId: req.user.id,
            accountNumber: accNum,
            type: accountType || 'savings',
            balance: balance || 0,
            ifsc: ifsc || 'PSB0001234',
            branch: branch || 'Main Branch',
            status: 'active'
        });
        res.json({ success: true, data: { id: result.lastInsertRowid, accountNumber: accNum } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/accounts/:id/balance', authMiddleware, (req, res) => {
    try {
        const account = bankingDb.getAccountById(req.params.id);
        if (!account || account.user_id !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }
        res.json({ success: true, data: { balance: account.balance, accountNumber: account.account_number } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/accounts/:id/status', authMiddleware, (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'frozen', 'closed'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Status must be active, frozen, or closed' });
        }
        const account = bankingDb.getAccountById(req.params.id);
        if (!account || account.user_id !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }
        bankingDb.updateAccountStatus(req.params.id, status);
        res.json({ success: true, message: `Account status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/accounts/:id', authMiddleware, (req, res) => {
    try {
        const account = bankingDb.getAccountById(req.params.id);
        if (!account || account.user_id !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }
        if (account.balance !== 0) {
            return res.status(400).json({ success: false, error: 'Account must have zero balance before closure' });
        }
        bankingDb.deleteAccount(req.params.id);
        res.json({ success: true, message: 'Account closed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== TRANSACTIONS ==========
router.get('/transactions', authMiddleware, (req, res) => {
    try {
        const { limit = 100, type, startDate, endDate, accountId } = req.query;
        const lim = parseInt(limit) || 100;
        let txns;

        if (accountId) {
            txns = bankingDb.getTransactionsByAccount(accountId, req.user.id, lim);
        } else if (startDate && endDate) {
            txns = bankingDb.getTransactionsByDateRange(req.user.id, startDate, endDate, lim);
        } else if (type) {
            txns = bankingDb.getTransactionsByType(req.user.id, type, lim);
        } else {
            txns = bankingDb.getTransactionsByUser(req.user.id, lim);
        }

        res.json({ success: true, count: txns.length, data: txns });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/transactions', authMiddleware, (req, res) => {
    try {
        const { type, amount, description, toAccount, fromAccount } = req.body;
        const amountCheck = validatePositiveNumber(amount, 'Amount');
        if (!amountCheck.valid) return res.status(400).json({ success: false, error: amountCheck.error });
        if (!type) return res.status(400).json({ success: false, error: 'Transaction type required' });

        const validTypes = ['credit', 'debit', 'transfer', 'upi', 'neft', 'imps'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ success: false, error: `Type must be one of: ${validTypes.join(', ')}` });
        }

        // For debit/transfer/upi/neft/imps: use atomic transfer
        if (['debit', 'transfer', 'upi', 'neft', 'imps'].includes(type)) {
            const accounts = bankingDb.getAccountsByUser(req.user.id);
            const primary = accounts.find(a => a.status === 'active') || accounts[0];
            if (!primary) return res.status(400).json({ success: false, error: 'No active account found' });

            const result = bankingDb.executeTransfer({
                fromAccountId: fromAccount || primary.id,
                toAccountId: toAccount || null,
                amount: amountCheck.value,
                userId: req.user.id,
                type,
                description: description || `${type.toUpperCase()} Transaction`
            });

            return res.json({ success: true, data: { id: result.transactionId, referenceId: result.referenceId } });
        }

        // For credit: add to primary account (also atomic)
        if (type === 'credit') {
            const accounts = bankingDb.getAccountsByUser(req.user.id);
            const primary = accounts.find(a => a.status === 'active') || accounts[0];
            if (!primary) return res.status(400).json({ success: false, error: 'No active account found' });

            const result = bankingDb.executeTransfer({
                fromAccountId: null,
                toAccountId: toAccount || primary.id,
                amount: amountCheck.value,
                userId: req.user.id,
                type: 'credit',
                description: description || 'Credit Transaction'
            });

            return res.json({ success: true, data: { id: result.transactionId, referenceId: result.referenceId } });
        }
    } catch (err) {
        if (err.message === 'Insufficient balance') {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== BENEFICIARIES ==========
router.get('/beneficiaries', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getBeneficiariesByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/beneficiaries', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['name']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { name, accountNumber, ifsc, bankName, upiId } = req.body;
        const result = bankingDb.createBeneficiary({
            userId: req.user.id, name, accountNumber, ifsc, bankName, upiId, verified: false
        });
        res.json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/beneficiaries/:id', authMiddleware, (req, res) => {
    try {
        const ben = db.prepare('SELECT * FROM beneficiaries WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!ben) return res.status(404).json({ success: false, error: 'Beneficiary not found' });
        bankingDb.updateBeneficiary(req.params.id, req.body);
        res.json({ success: true, message: 'Beneficiary updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/beneficiaries/:id', authMiddleware, (req, res) => {
    try {
        const ben = db.prepare('SELECT * FROM beneficiaries WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!ben) return res.status(404).json({ success: false, error: 'Beneficiary not found' });
        bankingDb.deleteBeneficiary(req.params.id);
        res.json({ success: true, message: 'Beneficiary deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== CARDS ==========
router.get('/cards', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getCardsByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/cards', authMiddleware, (req, res) => {
    try {
        const { cardType, limitDaily, limitMonthly } = req.body;
        const cardNum = '**** **** **** ' + Math.floor(1000 + Math.random() * 9000);
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 5);
        const expiryStr = String(expiry.getMonth() + 1).padStart(2, '0') + '/' + String(expiry.getFullYear()).slice(-2);
        const result = bankingDb.createCard({
            userId: req.user.id,
            cardNumberMasked: cardNum,
            expiry: expiryStr,
            cvvMasked: '***',
            cardType: cardType || 'debit',
            limitDaily: limitDaily || 50000,
            limitMonthly: limitMonthly || 500000
        });
        res.json({ success: true, data: { id: result.lastInsertRowid, cardNumber: cardNum } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/cards/:id/status', authMiddleware, (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'blocked', 'expired'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Status must be active, blocked, or expired' });
        }
        const card = db.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!card) return res.status(404).json({ success: false, error: 'Card not found' });
        bankingDb.updateCardStatus(req.params.id, status);
        res.json({ success: true, message: 'Card status updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/cards/:id/limits', authMiddleware, (req, res) => {
    try {
        const { limitDaily, limitMonthly } = req.body;
        const card = db.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!card) return res.status(404).json({ success: false, error: 'Card not found' });
        bankingDb.updateCardLimits(req.params.id, { limitDaily, limitMonthly });
        res.json({ success: true, message: 'Card limits updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/cards/:id', authMiddleware, (req, res) => {
    try {
        const card = db.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!card) return res.status(404).json({ success: false, error: 'Card not found' });
        bankingDb.deleteCard(req.params.id);
        res.json({ success: true, message: 'Card removed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== BILLS ==========
router.get('/bills', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getBillsByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/bills', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['name', 'amount']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { name, category, amount, dueDate, isRecurring, frequency } = req.body;
        const result = bankingDb.createBill({
            userId: req.user.id, name, category, amount, dueDate, isRecurring, frequency
        });
        res.json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/bills/:id/status', authMiddleware, (req, res) => {
    try {
        const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
        bankingDb.updateBillStatus(req.params.id, req.body.status);
        res.json({ success: true, message: 'Bill status updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/bills/:id', authMiddleware, (req, res) => {
    try {
        const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
        bankingDb.updateBill(req.params.id, req.body);
        res.json({ success: true, message: 'Bill updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/bills/:id', authMiddleware, (req, res) => {
    try {
        const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
        bankingDb.deleteBill(req.params.id);
        res.json({ success: true, message: 'Bill deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Bill Payment — actual money movement
router.post('/bills/:id/pay', authMiddleware, (req, res) => {
    try {
        const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
        if (bill.status === 'paid') return res.status(400).json({ success: false, error: 'Bill already paid' });

        const accounts = bankingDb.getAccountsByUser(req.user.id);
        const primary = accounts.find(a => a.status === 'active') || accounts[0];
        if (!primary) return res.status(400).json({ success: false, error: 'No active account found' });

        const result = bankingDb.executeTransfer({
            fromAccountId: primary.id,
            toAccountId: null,
            amount: bill.amount,
            userId: req.user.id,
            type: 'debit',
            description: `Bill Payment — ${bill.name}`
        });

        bankingDb.updateBillStatus(req.params.id, 'paid');
        res.json({ success: true, data: { transactionId: result.transactionId, referenceId: result.referenceId } });
    } catch (err) {
        if (err.message === 'Insufficient balance') {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== SUBSCRIPTIONS ==========
router.get('/subscriptions', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getSubscriptionsByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/subscriptions', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['name', 'amount']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { name, amount, billingCycle, nextBilling } = req.body;
        const result = bankingDb.createSubscription({
            userId: req.user.id, name, amount, billingCycle, nextBilling
        });
        res.json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/subscriptions/:id', authMiddleware, (req, res) => {
    try {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
        bankingDb.updateSubscription(req.params.id, req.body);
        res.json({ success: true, message: 'Subscription updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/subscriptions/:id', authMiddleware, (req, res) => {
    try {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
        bankingDb.deleteSubscription(req.params.id);
        res.json({ success: true, message: 'Subscription cancelled' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== GOALS ==========
router.get('/goals', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getGoalsByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/goals', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['name', 'targetAmount']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { name, targetAmount, currentAmount, deadline, goalType } = req.body;
        const result = bankingDb.createGoal({
            userId: req.user.id, name, targetAmount, currentAmount, deadline, goalType
        });
        res.json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/goals/:id/contribute', authMiddleware, (req, res) => {
    try {
        const { amount } = req.body;
        const amountCheck = validatePositiveNumber(amount, 'Amount');
        if (!amountCheck.valid) return res.status(400).json({ success: false, error: amountCheck.error });

        const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!goal) return res.status(404).json({ success: false, error: 'Goal not found' });

        const accounts = bankingDb.getAccountsByUser(req.user.id);
        const primary = accounts.find(a => a.status === 'active') || accounts[0];
        if (!primary) return res.status(400).json({ success: false, error: 'No active account found' });

        const result = bankingDb.executeTransfer({
            fromAccountId: primary.id,
            toAccountId: null,
            amount: amountCheck.value,
            userId: req.user.id,
            type: 'debit',
            description: `Goal Contribution — ${goal.name}`
        });

        bankingDb.updateGoalAmount(req.params.id, (goal.current_amount || 0) + amountCheck.value);
        res.json({ success: true, data: { transactionId: result.transactionId, referenceId: result.referenceId } });
    } catch (err) {
        if (err.message === 'Insufficient balance') {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/goals/:id', authMiddleware, (req, res) => {
    try {
        const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!goal) return res.status(404).json({ success: false, error: 'Goal not found' });
        bankingDb.updateGoal(req.params.id, req.body);
        res.json({ success: true, message: 'Goal updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/goals/:id', authMiddleware, (req, res) => {
    try {
        const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!goal) return res.status(404).json({ success: false, error: 'Goal not found' });
        bankingDb.deleteGoal(req.params.id);
        res.json({ success: true, message: 'Goal deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== ASSETS ==========
router.get('/assets', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getAssetsByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/assets', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['name']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { name, assetType, value, liquidity, returns } = req.body;
        const result = bankingDb.createAsset({
            userId: req.user.id, name, assetType, value, liquidity, returns
        });
        res.json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/assets/:id', authMiddleware, (req, res) => {
    try {
        const asset = db.prepare('SELECT * FROM user_assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
        bankingDb.updateAsset(req.params.id, req.body);
        res.json({ success: true, message: 'Asset updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/assets/:id', authMiddleware, (req, res) => {
    try {
        const asset = db.prepare('SELECT * FROM user_assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
        bankingDb.deleteAsset(req.params.id);
        res.json({ success: true, message: 'Asset deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== LOANS ==========
router.get('/loans', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getLoansByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/loans', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['loanType', 'principalAmount', 'interestRate', 'tenureMonths']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { loanType, principalAmount, interestRate, tenureMonths, purpose } = req.body;
        const p = Number(principalAmount);
        const r = Number(interestRate) / 12 / 100;
        const n = Number(tenureMonths);
        const emi = Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
        const totalPayable = Math.round(emi * n);
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 30);

        const result = bankingDb.createLoan({
            userId: req.user.id, loanType, principalAmount: p, interestRate: Number(interestRate),
            tenureMonths: n, emiAmount: emi, totalPayable, nextDueDate: nextDue.toISOString().split('T')[0], purpose
        });
        res.json({ success: true, data: { id: result.lastInsertRowid, emiAmount: emi, totalPayable } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/loans/:id/pay', authMiddleware, (req, res) => {
    try {
        const loan = db.prepare('SELECT * FROM loans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!loan) return res.status(404).json({ success: false, error: 'Loan not found' });

        const accounts = bankingDb.getAccountsByUser(req.user.id);
        const primary = accounts.find(a => a.status === 'active') || accounts[0];
        if (!primary) return res.status(400).json({ success: false, error: 'No active account found' });

        const result = bankingDb.executeTransfer({
            fromAccountId: primary.id,
            toAccountId: null,
            amount: loan.emi_amount,
            userId: req.user.id,
            type: 'debit',
            description: `EMI Payment — ${loan.loan_type} Loan`
        });

        const nextDue = new Date(loan.next_due_date);
        nextDue.setDate(nextDue.getDate() + 30);
        bankingDb.updateLoanPayment(req.params.id, loan.emi_amount, nextDue.toISOString().split('T')[0]);

        if (loan.amount_paid + loan.emi_amount >= loan.total_payable) {
            bankingDb.updateLoanStatus(req.params.id, 'closed');
        }

        res.json({ success: true, data: { transactionId: result.transactionId, referenceId: result.referenceId } });
    } catch (err) {
        if (err.message === 'Insufficient balance') {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== RECURRING PAYMENTS (SIPs / Auto-Debits) ==========
router.get('/recurring', authMiddleware, (req, res) => {
    try {
        const data = bankingDb.getRecurringByUser(req.user.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/recurring', authMiddleware, (req, res) => {
    try {
        const check = validateRequired(req.body, ['name', 'amount']);
        if (!check.valid) return res.status(400).json({ success: false, error: check.error });

        const { name, amount, frequency, category, accountId, beneficiaryId, startDate, endDate, nextExecution } = req.body;
        const result = bankingDb.createRecurring({
            userId: req.user.id, name, amount, frequency, category, accountId, beneficiaryId, startDate, endDate, nextExecution
        });
        res.json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/recurring/:id', authMiddleware, (req, res) => {
    try {
        const rec = db.prepare('SELECT * FROM recurring_payments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!rec) return res.status(404).json({ success: false, error: 'Recurring payment not found' });
        bankingDb.updateRecurring(req.params.id, req.body);
        res.json({ success: true, message: 'Recurring payment updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/recurring/:id', authMiddleware, (req, res) => {
    try {
        const rec = db.prepare('SELECT * FROM recurring_payments WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!rec) return res.status(404).json({ success: false, error: 'Recurring payment not found' });
        bankingDb.deleteRecurring(req.params.id);
        res.json({ success: true, message: 'Recurring payment cancelled' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== AUDIT LOGS ==========
router.get('/audit', authMiddleware, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const rows = bankingDb.getAuditLogsByUser(req.user.id, limit);
        // Map DB columns to frontend expected shape (details = human-readable summary)
        const data = rows.map(row => {
            let detailsText = row.new_value || row.old_value || '-';
            try {
                const parsed = JSON.parse(detailsText);
                if (parsed.description) detailsText = parsed.description;
                else if (parsed.note) detailsText = parsed.note;
                else if (parsed.name && parsed.amount) detailsText = `${parsed.name} — ₹${parsed.amount.toLocaleString?.() || parsed.amount}`;
                else if (parsed.name) detailsText = parsed.name;
                else if (parsed.type && parsed.amount) detailsText = `${parsed.type.toUpperCase()} — ₹${parsed.amount.toLocaleString?.() || parsed.amount}`;
                else detailsText = JSON.stringify(parsed).slice(0, 120);
            } catch {
                // keep as string
            }
            return {
                id: row.id,
                action: row.action,
                entity_type: row.entity_type,
                entity_id: row.entity_id,
                details: detailsText,
                ip_address: row.ip_address,
                user_agent: row.user_agent,
                status: 'success',
                created_at: row.created_at
            };
        });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== STATEMENTS ==========
router.get('/statements/:accountId', authMiddleware, (req, res) => {
    try {
        const account = bankingDb.getAccountById(req.params.accountId);
        if (!account || account.user_id !== req.user.id) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }
        const { startDate, endDate } = req.query;
        const start = startDate || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const end = endDate || new Date().toISOString().split('T')[0];
        const txns = bankingDb.getTransactionsByDateRange(req.user.id, start, end, 500);
        const accountIdNum = Number(req.params.accountId);
        const accountTxns = txns.filter(t => Number(t.from_account) === accountIdNum || Number(t.to_account) === accountIdNum);

        const openingBalance = account.balance + accountTxns
            .filter(t => ['debit', 'transfer', 'upi', 'neft', 'imps'].includes(t.type))
            .reduce((s, t) => s + t.amount, 0)
            - accountTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

        res.json({
            success: true,
            data: {
                account,
                period: { start, end },
                openingBalance,
                closingBalance: account.balance,
                totalCredits: accountTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
                totalDebits: accountTxns.filter(t => ['debit', 'transfer', 'upi', 'neft', 'imps'].includes(t.type)).reduce((s, t) => s + t.amount, 0),
                transactions: accountTxns
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== DASHBOARD SUMMARY ==========
router.get('/dashboard', authMiddleware, (req, res) => {
    try {
        const accounts = bankingDb.getAccountsByUser(req.user.id);
        const transactions = bankingDb.getTransactionsByUser(req.user.id, 5);
        const goals = bankingDb.getGoalsByUser(req.user.id);
        const bills = bankingDb.getBillsByUser(req.user.id);
        const cards = bankingDb.getCardsByUser(req.user.id);
        const assets = bankingDb.getAssetsByUser(req.user.id);
        const subscriptions = bankingDb.getSubscriptionsByUser(req.user.id);
        const beneficiaries = bankingDb.getBeneficiariesByUser(req.user.id);
        const kyc = bankingDb.getKycByUser(req.user.id);
        const loans = bankingDb.getLoansByUser(req.user.id);
        const recurring = bankingDb.getRecurringByUser(req.user.id);

        const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
        const totalAssets = assets.reduce((sum, a) => sum + a.value, 0);
        const netWorth = totalBalance + totalAssets;
        const monthlySpend = transactions
            .filter(t => ['debit', 'upi', 'transfer', 'neft', 'imps'].includes(t.type) && new Date(t.created_at) > new Date(Date.now() - 30 * 86400000))
            .reduce((sum, t) => sum + t.amount, 0);
        const monthlyIncome = transactions
            .filter(t => t.type === 'credit' && new Date(t.created_at) > new Date(Date.now() - 30 * 86400000))
            .reduce((sum, t) => sum + t.amount, 0);
        const totalLoanOutstanding = loans
            .filter(l => l.status === 'active')
            .reduce((sum, l) => sum + (l.total_payable - l.amount_paid), 0);
        const monthlyEmi = loans
            .filter(l => l.status === 'active')
            .reduce((sum, l) => sum + l.emi_amount, 0);

        res.json({
            success: true,
            data: {
                netWorth,
                totalBalance,
                totalAssets,
                monthlySpend,
                monthlyIncome,
                monthlyEmi,
                totalLoanOutstanding,
                accountCount: accounts.length,
                transactionCount: transactions.length,
                goalCount: goals.length,
                upcomingBills: bills.filter(b => b.status === 'upcoming').length,
                cards: cards.length,
                subscriptions: subscriptions.length,
                beneficiaries: beneficiaries.length,
                loans: loans.length,
                recurringCount: recurring.length,
                kycStatus: kyc?.kyc_status || 'pending',
                recentTransactions: transactions.slice(0, 5),
                accounts,
                goals,
                bills,
                assets,
                cards,
                subscriptions,
                loans,
                recurring
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== SEED (for judge demos) ==========
function resolveDemoUser(req) {
    if (req.user && req.user.id) return req.user;
    const devEmail = req.headers['x-dev-user-email'] || 'demo@psb.co.in';
    let user = userDb.findByEmail(devEmail);
    if (!user) {
        const bcrypt = require('bcryptjs');
        const id = require('crypto').randomUUID();
        userDb.create({ id, email: devEmail, password: bcrypt.hashSync('demo123', 12), name: devEmail.split('@')[0], role: 'user', tier: 'premium' });
        user = userDb.findByEmail(devEmail);
    }
    return user;
}

router.post('/seed', (req, res) => {
    try {
        const user = resolveDemoUser(req);
        const userId = user.id;
        const force = req.query.force === 'true' || req.body.force === true;

        if (force) {
            // Clear existing user demo data so re-seeding works without duplicates
            db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM recurring_payments WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM loans WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM beneficiaries WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM user_assets WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM cards WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM bills WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM goals WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM bank_accounts WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM kyc_records WHERE user_id = ?').run(userId);
        } else {
            const existing = bankingDb.getAccountsByUser(userId);
            if (existing.length > 0) {
                return res.json({ success: true, message: 'User already has data' });
            }
        }

        // Audit helper
        const audit = (action, entityType, entityId, newValue) => {
            bankingDb.createAuditLog({
                userId, action, entityType, entityId,
                newValue: newValue ? JSON.stringify(newValue) : null,
                ipAddress: req.ip || req.socket?.remoteAddress || null,
                userAgent: req.headers['user-agent'] || null
            });
        };

        // Create savings account with high balance to cover demo outflows
        const accResult = bankingDb.createAccount({
            userId, accountNumber: 'PSB' + Date.now(), type: 'savings', balance: 1000000,
            ifsc: 'PSB0001234', branch: 'Connaught Place, New Delhi', status: 'active'
        });
        const accountId = accResult.lastInsertRowid;
        audit('CREATE', 'account', accountId, { type: 'savings', balance: 1000000 });

        // Create FD
        const fdResult = bankingDb.createAccount({
            userId, accountNumber: 'PSB' + (Date.now() + 1), type: 'fixed_deposit', balance: 200000,
            ifsc: 'PSB0001234', branch: 'Connaught Place, New Delhi', status: 'active'
        });
        const fdAccountId = fdResult.lastInsertRowid;
        audit('CREATE', 'account', fdAccountId, { type: 'fixed_deposit', balance: 200000 });

        // Seed transactions using executeTransfer so balances update and from/to accounts are linked
        const txns = [
            { type: 'credit', amount: 85000, description: 'Salary Credit — Deloitte Consulting' },
            { type: 'credit', amount: 12000, description: 'Dividend — Infosys Ltd' },
            { type: 'credit', amount: 5000, description: 'Cashback — Credit Card' },
            { type: 'credit', amount: 15000, description: 'Freelance — Web Design Project' },
            { type: 'debit', amount: 15000, description: 'SIP — Axis Bluechip Fund' },
            { type: 'debit', amount: 18500, description: 'CRED — Rent Payment' },
            { type: 'debit', amount: 3200, description: 'Swiggy — Dinner' },
            { type: 'debit', amount: 280000, description: 'Apple India — MacBook Pro M3' },
            { type: 'debit', amount: 12500, description: 'Amazon — Groceries' },
            { type: 'debit', amount: 2500, description: 'Uber — Airport Drop' },
            { type: 'upi', amount: 500, description: 'UPI to Mrigesh Mohanty' },
            { type: 'debit', amount: 999, description: 'Netflix Subscription' },
            { type: 'debit', amount: 1499, description: 'Amazon Prime Renewal' },
            { type: 'debit', amount: 4200, description: 'Airtel — Broadband Bill' },
            { type: 'debit', amount: 8500, description: 'Zomato — Team Lunch' },
            { type: 'debit', amount: 1800, description: 'BookMyShow — Movie Tickets' },
            { type: 'transfer', amount: 25000, description: 'Transfer to Fixed Deposit' },
            { type: 'debit', amount: 649, description: 'Spotify Premium Renewal' },
            { type: 'debit', amount: 4500, description: 'Petrol — Indian Oil' },
            { type: 'upi', amount: 1200, description: 'UPI to Vegetable Vendor' },
        ];

        txns.forEach(t => {
            try {
                const isCredit = t.type === 'credit';
                const isTransferToFd = t.type === 'transfer';
                const result = bankingDb.executeTransfer({
                    userId,
                    fromAccountId: isCredit ? null : accountId,
                    toAccountId: isTransferToFd ? fdAccountId : (isCredit ? accountId : null),
                    amount: t.amount,
                    type: t.type,
                    description: t.description
                });
                audit(isCredit ? 'CREATE' : (isTransferToFd ? 'TRANSFER' : 'DEBIT'), 'transaction', result.transactionId, { type: t.type, amount: t.amount, description: t.description });
            } catch (txnErr) {
                // If transfer fails (e.g. insufficient balance), fall back to a simple transaction record
                const fallback = bankingDb.createTransaction({
                    userId, type: t.type, amount: t.amount, description: t.description + ' (record only)',
                    status: 'completed', fromAccount: t.type === 'credit' ? null : accountId, toAccount: t.type === 'credit' ? accountId : null
                });
                audit('CREATE', 'transaction', fallback.lastInsertRowid, { type: t.type, amount: t.amount, note: 'fallback record' });
            }
        });

        // Seed goals
        const goals = [
            { name: 'Emergency Fund', targetAmount: 300000, currentAmount: 125000, deadline: '2026-12-31', goalType: 'emergency' },
            { name: 'New Car — Tesla Model 3', targetAmount: 4500000, currentAmount: 850000, deadline: '2028-06-30', goalType: 'vehicle' },
            { name: 'Europe Vacation', targetAmount: 800000, currentAmount: 220000, deadline: '2027-03-31', goalType: 'travel' },
            { name: 'Child Education Fund', targetAmount: 2000000, currentAmount: 300000, deadline: '2030-06-01', goalType: 'education' }
        ];
        goals.forEach(g => {
            const r = bankingDb.createGoal({ userId, ...g });
            audit('CREATE', 'goal', r.lastInsertRowid, g);
        });

        // Seed bills
        const bills = [
            { name: 'House Rent', category: 'Housing', amount: 18500, dueDate: '2026-06-05', isRecurring: true, frequency: 'monthly' },
            { name: 'Electricity & Utilities', category: 'Utilities', amount: 3200, dueDate: '2026-06-15', isRecurring: true, frequency: 'monthly' },
            { name: 'WiFi & Phone', category: 'Utilities', amount: 1200, dueDate: '2026-06-20', isRecurring: true, frequency: 'monthly' },
            { name: 'Monthly SIPs', category: 'Investment', amount: 25000, dueDate: '2026-06-05', isRecurring: true, frequency: 'monthly' }
        ];
        bills.forEach(b => {
            const r = bankingDb.createBill({ userId, ...b });
            audit('CREATE', 'bill', r.lastInsertRowid, b);
        });

        // Seed subscriptions
        const subscriptions = [
            { name: 'Netflix', amount: 649, billingCycle: 'monthly', nextBilling: '2026-07-01' },
            { name: 'Amazon Prime', amount: 1499, billingCycle: 'yearly', nextBilling: '2027-05-01' },
            { name: 'Spotify Premium', amount: 119, billingCycle: 'monthly', nextBilling: '2026-07-05' },
            { name: 'Google One', amount: 195, billingCycle: 'monthly', nextBilling: '2026-07-10' },
            { name: 'YouTube Premium', amount: 129, billingCycle: 'monthly', nextBilling: '2026-07-15' }
        ];
        subscriptions.forEach(s => {
            const r = bankingDb.createSubscription({ userId, ...s });
            audit('CREATE', 'subscription', r.lastInsertRowid, s);
        });

        // Seed cards
        const cards = [
            { cardNumberMasked: '**** **** **** 4821', expiry: '05/29', cvvMasked: '***', cardType: 'debit', limitDaily: 100000, limitMonthly: 1000000 },
            { cardNumberMasked: '**** **** **** 7734', expiry: '08/28', cvvMasked: '***', cardType: 'credit', limitDaily: 200000, limitMonthly: 2000000 }
        ];
        cards.forEach(c => {
            const r = bankingDb.createCard({ userId, ...c });
            audit('CREATE', 'card', r.lastInsertRowid, { cardType: c.cardType });
        });

        // Seed assets
        const assets = [
            { name: 'SBI Privilege Savings', assetType: 'bank', value: 525000, liquidity: 'high', returns: 3.5 },
            { name: 'Axis Bluechip Direct', assetType: 'mutual_fund', value: 820000, liquidity: 'medium', returns: 16.2 },
            { name: 'Nifty 50 Index Fund', assetType: 'stock', value: 650000, liquidity: 'high', returns: 13.8 },
            { name: 'Physical Gold & SGBs', assetType: 'gold', value: 420000, liquidity: 'medium', returns: 8.5 },
            { name: 'Gurgaon Penthouse', assetType: 'property', value: 18500000, liquidity: 'low', returns: 12.0 },
            { name: 'Crypto Portfolio', assetType: 'crypto', value: 180000, liquidity: 'high', returns: -5.2 }
        ];
        assets.forEach(a => {
            const r = bankingDb.createAsset({ userId, ...a });
            audit('CREATE', 'asset', r.lastInsertRowid, { name: a.name, value: a.value });
        });

        // Seed beneficiaries
        const beneficiaries = [
            { name: 'Priya Sharma', accountNumber: '123456789012', ifsc: 'SBIN0001234', bankName: 'State Bank of India', upiId: 'priya@upi', verified: true },
            { name: 'Aarav Sharma', accountNumber: '987654321098', ifsc: 'HDFC0005678', bankName: 'HDFC Bank', upiId: 'aarav@upi', verified: true },
            { name: 'Ramesh Kumar', accountNumber: null, ifsc: null, bankName: null, upiId: 'ramesh@paytm', verified: false }
        ];
        beneficiaries.forEach(b => {
            const r = bankingDb.createBeneficiary({ userId, ...b });
            audit('CREATE', 'beneficiary', r.lastInsertRowid, { name: b.name });
        });

        // Seed loans
        const loans = [
            { loanType: 'personal', principalAmount: 500000, interestRate: 11.5, tenureMonths: 36, emiAmount: 16472, totalPayable: 592992, nextDueDate: '2026-07-05', purpose: 'Home Renovation' },
            { loanType: 'car', principalAmount: 800000, interestRate: 9.0, tenureMonths: 60, emiAmount: 16607, totalPayable: 996420, nextDueDate: '2026-07-10', purpose: 'Tesla Model 3' }
        ];
        loans.forEach(l => {
            const r = bankingDb.createLoan({ userId, ...l });
            audit('CREATE', 'loan', r.lastInsertRowid, { loanType: l.loanType, principalAmount: l.principalAmount });
        });

        // Seed recurring payments (SIPs / auto-debits)
        const recurring = [
            { name: 'Axis Bluechip SIP', amount: 15000, frequency: 'monthly', category: 'Investment', nextExecution: '2026-07-05' },
            { name: 'Nifty Index SIP', amount: 10000, frequency: 'monthly', category: 'Investment', nextExecution: '2026-07-05' },
            { name: 'PPF Contribution', amount: 12500, frequency: 'monthly', category: 'Savings', nextExecution: '2026-07-01' }
        ];
        recurring.forEach(rp => {
            const r = bankingDb.createRecurring({ userId, ...rp });
            audit('CREATE', 'recurring', r.lastInsertRowid, { name: rp.name, amount: rp.amount });
        });

        // Update KYC
        bankingDb.createOrUpdateKyc({ userId, panNumber: 'ABCDE1234F', aadhaarMasked: '**** **** 5678', kycStatus: 'verified', verifiedAt: new Date().toISOString() });
        audit('UPDATE', 'kyc', null, { kycStatus: 'verified' });

        // Login audit entry
        audit('LOGIN', 'user', null, { email: user.email, seededAt: new Date().toISOString() });

        res.json({ success: true, message: 'Judge demo data seeded successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
