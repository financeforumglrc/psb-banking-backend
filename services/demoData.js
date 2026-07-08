/**
 * Pre-seeded demo user data for DEMO_MODE.
 * Used by banking and AI routes when DEMO_MODE=true and req.user.id === 'demo-001'.
 */

function generateLast6Months() {
  const txns = [];
  const categories = ['food', 'transport', 'shopping', 'utilities', 'entertainment', 'investment'];
  const amounts = [250, 500, 1200, 2500, 5000, 800, 1500];
  for (let i = 180; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (Math.random() > 0.4) {
      txns.push({
        id: `txn-${i}`,
        amount: amounts[Math.floor(Math.random() * amounts.length)],
        category: categories[Math.floor(Math.random() * categories.length)],
        description: 'Demo transaction',
        date: d.toISOString().split('T')[0],
        created_at: d.toISOString(),
        type: Math.random() > 0.7 ? 'credit' : 'debit',
      });
    }
  }
  return txns;
}

const DEMO_USER = {
  id: 'demo-001',
  name: 'Rahul Sharma',
  email: 'demo@psb-securwealth.com',
  age: 28,
  income: 1200000,
  risk_profile: 'moderate',
  accounts: [
    { id: 'acc-1', type: 'savings', bank: 'PSB', balance: 285000, account_number: 'XXXX1234', ifsc: 'PSB0001234', branch: 'Connaught Place, New Delhi', status: 'active' },
    { id: 'acc-2', type: 'fd', bank: 'PSB', balance: 500000, account_number: 'XXXX5678', maturity_date: '2025-12-31', status: 'active' }
  ],
  assets: [
    { id: 'ast-1', type: 'gold', name: '50g Gold', value: 300000, quantity: 1 },
    { id: 'ast-2', type: 'property', name: 'Flat - Noida', value: 4500000, quantity: 1 }
  ],
  goals: [
    { id: 'g-1', name: 'Home Down Payment', target: 1500000, current: 650000, deadline: '2026-12-31', status: 'active' },
    { id: 'g-2', name: 'Emergency Fund', target: 300000, current: 285000, deadline: '2025-06-30', status: 'active' }
  ],
  transactions: generateLast6Months(),
  devices: [
    { id: 'dev-1', fingerprint: 'trusted-device-001', label: 'Home Laptop', trusted: true },
    { id: 'dev-2', fingerprint: 'unknown-device-999', label: 'Unknown Device', trusted: false }
  ]
};

module.exports = { DEMO_USER };
