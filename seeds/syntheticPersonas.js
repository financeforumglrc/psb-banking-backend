/**
 * SecureWealth Twin — Curated synthetic personas and deterministic generators.
 *
 * These 8 personas mirror the frontend demo accounts in
 * client/src/shared/data/userProfiles.ts.  Each persona gets:
 *   • profile + login credentials
 *   • 3 bank accounts
 *   • ~60 transactions (mix of credit/debit/UPI/NEFT/IMPS)
 *   • goals + assets aligned to their net worth
 *   • a handful of risk events for the protection-layer demo
 *
 * Data is synthetic. Real public sources (RBI, NSE, Kaggle spending/fraud
 * datasets, MCX) are cited in the pitch as inspiration, not as live feeds.
 */

const crypto = require('crypto');

const DEMO_PASSWORD = 'SecureWealth@123';

// Curated personas (same ids/emails as frontend DEMO_ACCOUNTS)
const PERSONAS = [
  {
    id: 'deepanshu-sharma',
    name: 'Deepanshu Sharma',
    email: 'deepanshu.sharma@psbsecurewealth.com',
    phone: '98765 43210',
    pan: 'ABCDE1234F',
    aadhar: '1234 5678 9012',
    role: 'user',
    tier: 'enterprise',
    riskProfile: 'Aggressive',
    taxBracket: 30,
    monthlyIncome: 850000,
    monthlyExpenses: 320000,
    netWorth: 52400000,
    occupation: 'Ultra HNI',
    location: 'New Delhi',
  },
  {
    id: 'mrigesh-mohanty',
    name: 'Mrigesh Mohanty',
    email: 'mrigesh.mohanty@psbsecurewealth.com',
    phone: '98765 43211',
    pan: 'ABCDE1235F',
    aadhar: '1234 5678 9013',
    role: 'user',
    tier: 'premium',
    riskProfile: 'Moderate',
    taxBracket: 30,
    monthlyIncome: 280000,
    monthlyExpenses: 145000,
    netWorth: 18400000,
    occupation: 'Tech Lead',
    location: 'Bhubaneswar',
  },
  {
    id: 'rikshita-barua',
    name: 'Rikshita Barua',
    email: 'rikshita.barua@psbsecurewealth.com',
    phone: '98765 43212',
    pan: 'ABCDE1236F',
    aadhar: '1234 5678 9014',
    role: 'user',
    tier: 'premium',
    riskProfile: 'Moderate',
    taxBracket: 20,
    monthlyIncome: 125000,
    monthlyExpenses: 82000,
    netWorth: 9650000,
    occupation: 'Marketing Strategist',
    location: 'Guwahati',
  },
  {
    id: 'ishita-anand',
    name: 'Ishita Anand',
    email: 'ishita.anand@psbsecurewealth.com',
    phone: '98765 43213',
    pan: 'ABCDE1237F',
    aadhar: '1234 5678 9015',
    role: 'user',
    tier: 'enterprise',
    riskProfile: 'Aggressive',
    taxBracket: 30,
    monthlyIncome: 420000,
    monthlyExpenses: 195000,
    netWorth: 24500000,
    occupation: 'Business Owner',
    location: 'New Delhi',
  },
  {
    id: 'neha-gupta',
    name: 'Dr. Neha Gupta',
    email: 'neha.gupta@psbsecurewealth.com',
    phone: '98765 43214',
    pan: 'ABCDE1238F',
    aadhar: '1234 5678 9016',
    role: 'user',
    tier: 'premium',
    riskProfile: 'Conservative',
    taxBracket: 30,
    monthlyIncome: 380000,
    monthlyExpenses: 145000,
    netWorth: 32000000,
    occupation: 'Dermatologist',
    location: 'Pune',
  },
  {
    id: 'meera-krishnan',
    name: 'Meera Krishnan',
    email: 'meera.krishnan@psbsecurewealth.com',
    phone: '98765 43215',
    pan: 'ABCDE1239F',
    aadhar: '1234 5678 9017',
    role: 'user',
    tier: 'premium',
    riskProfile: 'Aggressive',
    taxBracket: 30,
    monthlyIncome: 290000,
    monthlyExpenses: 120000,
    netWorth: 26000000,
    occupation: 'Architect',
    location: 'Chennai',
  },
  {
    id: 'balbir-singh',
    name: 'Balbir Singh',
    email: 'balbir.singh@psbsecurewealth.com',
    phone: '98765 43216',
    pan: 'ABCDE1240F',
    aadhar: '1234 5678 9018',
    role: 'user',
    tier: 'free',
    riskProfile: 'Conservative',
    taxBracket: 20,
    monthlyIncome: 85000,
    monthlyExpenses: 48000,
    netWorth: 7200000,
    occupation: 'Retired Army Officer',
    location: 'Chandigarh',
  },
  {
    id: 'kunal-saxena',
    name: 'Kunal Saxena',
    email: 'kunal.saxena@psbsecurewealth.com',
    phone: '98765 43217',
    pan: 'ABCDE1241F',
    aadhar: '1234 5678 9019',
    role: 'user',
    tier: 'free',
    riskProfile: 'Aggressive',
    taxBracket: 20,
    monthlyIncome: 95000,
    monthlyExpenses: 62000,
    netWorth: 7850000,
    occupation: 'Early Investor',
    location: 'Noida',
  },
];

// Indian cities for IP geolocation variety in audit/fraud events
const CITIES = [
  { city: 'New Delhi', country: 'India', lat: 28.6139, lon: 77.209 },
  { city: 'Mumbai', country: 'India', lat: 19.076, lon: 72.8777 },
  { city: 'Bangalore', country: 'India', lat: 12.9716, lon: 77.5946 },
  { city: 'Chennai', country: 'India', lat: 13.0827, lon: 80.2707 },
  { city: 'Kolkata', country: 'India', lat: 22.5726, lon: 88.3639 },
  { city: 'Hyderabad', country: 'India', lat: 17.385, lon: 78.4867 },
  { city: 'Pune', country: 'India', lat: 18.5204, lon: 73.8567 },
  { city: 'Ahmedabad', country: 'India', lat: 23.0225, lon: 72.5714 },
  { city: 'Jaipur', country: 'India', lat: 26.9124, lon: 75.7873 },
  { city: 'Lucknow', country: 'India', lat: 26.8467, lon: 80.9462 },
];

// Risky locations for fraud heatmap demo
const RISKY_LOCATIONS = [
  { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792 },
  { city: 'Moscow', country: 'Russia', lat: 55.7558, lon: 37.6173 },
  { city: 'Hanoi', country: 'Vietnam', lat: 21.0278, lon: 105.8342 },
  { city: 'Jakarta', country: 'Indonesia', lat: 6.2088, lon: 106.8456 },
  { city: 'Karachi', country: 'Pakistan', lat: 24.8607, lon: 67.0011 },
  { city: 'Dhaka', country: 'Bangladesh', lat: 23.8103, lon: 90.4125 },
  { city: 'Bangkok', country: 'Thailand', lat: 13.7563, lon: 100.5018 },
  { city: 'Manila', country: 'Philippines', lat: 14.5995, lon: 120.9842 },
];

const BANKS = ['HDFC Bank', 'SBI', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra', 'PNB', 'Bank of Baroda'];
const BRANCHES = ['Connaught Place, New Delhi', 'Bandra, Mumbai', 'Koramangala, Bangalore', 'T Nagar, Chennai', 'Salt Lake, Kolkata'];
const IFSC_PREFIXES = ['HDFC', 'SBIN', 'ICIC', 'UTIB', 'KKBK', 'PUNB', 'BARB'];

const TXN_DESCRIPTIONS = {
  credit: [
    'Salary Credit — {company}',
    'Freelance Payment — {company}',
    'Dividend — {company}',
    'Refund — {company}',
    'Interest Credit',
    'Rental Income',
    'Cashback Credit',
  ],
  debit: [
    'Grocery',
    'Dining',
    'Fuel',
    'Pharmacy',
    'Insurance Premium',
    'Subscription',
    'Utility Bill',
    'Mobile Recharge',
  ],
  upi: [
    'UPI to {name}',
    'UPI Merchant Payment',
    'UPI Scan & Pay',
    'UPI Splitwise Settlement',
    'UPI Rent Payment',
  ],
  neft: [
    'NEFT to {name}',
    'NEFT — Loan EMI',
    'NEFT — Investment Credit',
  ],
  imps: [
    'IMPS to {name}',
    'IMPS — Family Transfer',
    'IMPS — Emergency Transfer',
  ],
  transfer: [
    'Internal Transfer — Savings to FD',
    'Internal Transfer — FD Maturity',
    'Self Transfer',
  ],
};

const COMPANIES = [
  'Deloitte Consulting', 'Google India', 'Microsoft India', 'Amazon India',
  'TCS', 'Infosys', 'Wipro', 'HCLTech', 'Accenture', 'KPMG India',
  'Unilever', 'Zerodha', 'HDFC Bank', 'ICICI Bank', 'Axis Bank',
];

const MERCHANTS = [
  'Amazon India', 'Flipkart', 'Myntra', 'Nykaa', 'BigBasket',
  'Blinkit', 'Swiggy', 'Zomato', 'BookMyShow', 'Cred',
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function rand(seed, idx = 0) {
  const x = Math.sin(hashString(String(seed)) + idx * 0.573) * 10000;
  return x - Math.floor(x);
}

function pick(seed, idx, arr) {
  return arr[Math.floor(rand(seed, idx) * arr.length)];
}

function randomDateInRange(start, end, seed, idx) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const ms = startMs + rand(seed, idx) * (endMs - startMs);
  return new Date(ms);
}

function formatDateTime(d) {
  return d.toISOString();
}

function generateAccountNumber(seed, idx) {
  const base = 100000000000 + Math.floor(rand(seed, idx) * 900000000000);
  return String(base);
}

function maskAccountNumber(num) {
  return 'XXXX' + String(num).slice(-4);
}

function generateAccounts(persona) {
  const seed = persona.id;
  const primaryBankIdx = Math.floor(rand(seed, 1) * BANKS.length);
  const secondaryBankIdx = Math.floor(rand(seed, 2) * BANKS.length);
  const fdBankIdx = Math.floor(rand(seed, 3) * BANKS.length);

  const liquid = Math.round(persona.netWorth * (0.05 + rand(seed, 4) * 0.08));
  const savingsBalance = Math.round(liquid * 0.6);
  const currentBalance = Math.round(liquid * 0.25);
  const fdBalance = Math.round(liquid * 0.15);

  return [
    {
      accountNumber: generateAccountNumber(seed, 10),
      type: 'savings',
      balance: savingsBalance,
      bank: BANKS[primaryBankIdx],
      ifsc: `${IFSC_PREFIXES[primaryBankIdx]}0${String(100000 + Math.floor(rand(seed, 11) * 900000))}`,
      branch: BRANCHES[Math.floor(rand(seed, 12) * BRANCHES.length)],
      status: 'active',
    },
    {
      accountNumber: generateAccountNumber(seed, 20),
      type: persona.occupation === 'Business Owner' ? 'current' : 'savings',
      balance: currentBalance,
      bank: BANKS[secondaryBankIdx],
      ifsc: `${IFSC_PREFIXES[secondaryBankIdx]}0${String(100000 + Math.floor(rand(seed, 21) * 900000))}`,
      branch: BRANCHES[Math.floor(rand(seed, 22) * BRANCHES.length)],
      status: 'active',
    },
    {
      accountNumber: generateAccountNumber(seed, 30),
      type: 'fixed_deposit',
      balance: fdBalance,
      bank: BANKS[fdBankIdx],
      ifsc: `${IFSC_PREFIXES[fdBankIdx]}0${String(100000 + Math.floor(rand(seed, 31) * 900000))}`,
      branch: BRANCHES[Math.floor(rand(seed, 32) * BRANCHES.length)],
      status: 'active',
    },
  ];
}

function generateAssets(persona) {
  const seed = persona.id;
  const assets = [];
  const nw = persona.netWorth;

  // Bank / liquid (already in accounts, but include as asset for wealth twin)
  const bankAsset = Math.round(nw * (0.06 + rand(seed, 100) * 0.07));
  assets.push({ name: 'Bank Balances', assetType: 'bank', value: bankAsset, liquidity: 'high' });

  // Property for affluent
  if (nw > 15000000) {
    assets.push({
      name: `${persona.location} Residence`,
      assetType: 'property',
      value: Math.round(nw * (0.25 + rand(seed, 200) * 0.2)),
      liquidity: 'low',
    });
  }

  // Vehicle
  if (nw > 8000000) {
    assets.push({
      name: pick(seed, 300, ['Honda City', 'Hyundai Creta', 'Tata Nexon', 'BMW 3 Series', 'Mercedes C-Class', 'Toyota Innova']),
      assetType: 'vehicle',
      value: Math.min(Math.round(nw * (0.04 + rand(seed, 301) * 0.08)), 2500000),
      liquidity: 'low',
    });
  }

  // Mutual funds
  const mfPct = persona.riskProfile === 'Aggressive' ? 0.15 + rand(seed, 400) * 0.15
    : persona.riskProfile === 'Moderate' ? 0.1 + rand(seed, 400) * 0.1
      : 0.06 + rand(seed, 400) * 0.08;
  assets.push({
    name: pick(seed, 401, ['Nifty 50 Index Fund', 'SBI Bluechip', 'Axis Midcap', 'HDFC Small Cap', 'Mirae Asset Large Cap']),
    assetType: 'mutualFund',
    value: Math.round(nw * mfPct),
    liquidity: 'medium',
    returns: parseFloat((7 + rand(seed, 402) * 14).toFixed(1)),
  });

  // Stocks
  const stockPct = persona.riskProfile === 'Aggressive' ? 0.12 + rand(seed, 500) * 0.18
    : persona.riskProfile === 'Moderate' ? 0.07 + rand(seed, 500) * 0.1
      : 0.03 + rand(seed, 500) * 0.07;
  assets.push({
    name: pick(seed, 501, ['Reliance Industries', 'TCS', 'HDFC Bank', 'Infosys', 'Bharti Airtel', 'ITC', 'LIC India']),
    assetType: 'stock',
    value: Math.round(nw * stockPct),
    liquidity: 'high',
    returns: parseFloat((8 + rand(seed, 502) * 16).toFixed(1)),
  });

  // Gold
  assets.push({
    name: pick(seed, 601, ['Physical Gold Jewellery', 'Sovereign Gold Bonds', 'Digital Gold', 'Gold ETF']),
    assetType: 'gold',
    value: Math.round(nw * (0.03 + rand(seed, 602) * 0.07)),
    liquidity: 'medium',
  });

  // Alternatives for aggressive
  if (persona.riskProfile === 'Aggressive' && rand(seed, 700) > 0.4) {
    assets.push({
      name: pick(seed, 701, ['Crypto Portfolio', 'ESOPs', 'Peer-to-Peer Lending', 'Angel Investment']),
      assetType: 'other',
      value: Math.round(nw * (0.02 + rand(seed, 702) * 0.06)),
      liquidity: 'high',
    });
  }

  // Scale to net worth
  const currentSum = assets.reduce((s, a) => s + a.value, 0);
  const scale = nw / currentSum;
  assets.forEach(a => { a.value = Math.round(a.value * scale); });

  return assets;
}

function generateGoals(persona) {
  const seed = persona.id;
  const goalPool = [
    ['Emergency Fund', 'emergency'],
    ['Dream Car', 'car'],
    ['Europe Trip', 'travel'],
    ['Child Education Fund', 'education'],
    ['Own Home', 'home'],
    ['Retirement Corpus', 'retirement'],
    ['Wedding Fund', 'wedding'],
    ['Second Property', 'home'],
    ['Startup Seed Fund', 'other'],
    ['Parents Medical Corpus', 'emergency'],
  ];
  const count = 3 + Math.floor(rand(seed, 900) * 2);
  const goals = [];
  for (let i = 0; i < count; i++) {
    const [name, type] = pick(seed, 901 + i, goalPool);
    const target = Math.round(persona.netWorth * (0.15 + rand(seed, 910 + i) * 0.5));
    const current = Math.round(target * (0.15 + rand(seed, 920 + i) * 0.5));
    const year = 2027 + Math.floor(rand(seed, 930 + i) * 9);
    const month = 1 + Math.floor(rand(seed, 940 + i) * 12);
    const day = 1 + Math.floor(rand(seed, 950 + i) * 28);
    goals.push({
      name,
      goalType: type,
      targetAmount: target,
      currentAmount: current,
      deadline: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      status: 'active',
    });
  }
  return goals;
}

function generateTransactions(persona, accounts, count = 60) {
  const seed = persona.id;
  const txns = [];
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 180);

  const primary = accounts.find(a => a.type === 'savings');
  const secondary = accounts.find(a => a.type !== 'fixed_deposit' && a.type !== 'savings') || accounts[1];
  const fd = accounts.find(a => a.type === 'fixed_deposit');

  // Salary / main income once a month
  for (let m = 0; m < 6; m++) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    d.setDate(1);
    txns.push({
      type: 'credit',
      amount: persona.monthlyIncome,
      description: `Salary Credit — ${pick(seed + m, 1, COMPANIES)}`,
      fromAccount: null,
      toAccount: primary.accountNumber,
      createdAt: d.toISOString(),
      status: 'completed',
      riskLevel: 'LOW',
    });
  }

  // Recurring SIP / rent / EMI
  for (let m = 0; m < 6; m++) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    d.setDate(5);
    txns.push({
      type: 'debit',
      amount: Math.round(persona.monthlyExpenses * 0.25),
      description: 'Home Loan EMI / Rent Payment',
      fromAccount: primary.accountNumber,
      toAccount: null,
      createdAt: d.toISOString(),
      status: 'completed',
      riskLevel: 'LOW',
    });
  }

  // SIP
  for (let m = 0; m < 6; m++) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    d.setDate(7);
    txns.push({
      type: 'debit',
      amount: Math.round(persona.monthlyIncome * (0.05 + rand(seed + m, 2) * 0.1)),
      description: 'Mutual Fund SIP',
      fromAccount: primary.accountNumber,
      toAccount: null,
      createdAt: d.toISOString(),
      status: 'completed',
      riskLevel: 'LOW',
    });
  }

  // Random transactions for remaining count
  let idx = 100;
  while (txns.length < count) {
    const d = randomDateInRange(start, end, seed, idx);
    const type = pick(seed, idx, ['debit', 'upi', 'neft', 'imps', 'transfer', 'credit']);
    let amount;
    let description;

    if (type === 'credit') {
      amount = Math.round(persona.monthlyIncome * (0.02 + rand(seed, idx + 1) * 0.1));
      description = pick(seed, idx + 2, TXN_DESCRIPTIONS.credit).replace('{company}', pick(seed, idx + 3, COMPANIES));
    } else if (type === 'transfer') {
      amount = Math.round(persona.monthlyIncome * (0.05 + rand(seed, idx + 1) * 0.15));
      description = pick(seed, idx + 2, TXN_DESCRIPTIONS.transfer);
    } else {
      amount = Math.round(200 + rand(seed, idx + 1) * (persona.monthlyIncome * 0.25));
      description = pick(seed, idx + 2, TXN_DESCRIPTIONS[type])
        .replace('{company}', pick(seed, idx + 3, COMPANIES))
        .replace('{name}', pick(seed, idx + 4, ['Rahul Sharma', 'Priya Kumar', 'Vikram Singh', 'Ananya Bose', 'Family Account']));
    }

    // Occasional merchant names for debit/UPI
    if ((type === 'debit' || type === 'upi') && rand(seed, idx + 5) > 0.6) {
      description = `${pick(seed, idx + 6, MERCHANTS)} — ${description}`;
    }

    const fromAccount = ['debit', 'upi', 'neft', 'imps', 'transfer'].includes(type) ? primary.accountNumber : null;
    const toAccount = type === 'credit' ? primary.accountNumber : (type === 'transfer' ? secondary.accountNumber : null);

    txns.push({
      type,
      amount,
      description,
      fromAccount,
      toAccount,
      createdAt: d.toISOString(),
      status: 'completed',
      riskLevel: 'LOW',
    });

    idx += 10;
  }

  // Sort by date
  txns.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Inject a few HIGH risk transactions (8–12%)
  const riskCount = Math.max(1, Math.floor(txns.length * (0.08 + rand(seed, 999) * 0.04)));
  const flaggedPositions = new Set();
  for (let i = 0; i < riskCount; i++) {
    const pos = Math.floor(rand(seed, 2000 + i) * txns.length);
    if (flaggedPositions.has(pos)) continue;
    flaggedPositions.add(pos);
    const t = txns[pos];
    if (t.type === 'credit') continue;
    t.riskLevel = 'HIGH';
    t.riskReason = pick(seed, 3000 + i, [
      'Unusual amount vs 90-day average',
      'New device / location login',
      'Rushed action after login',
      'Multiple OTP retries',
      'First-time beneficiary transfer',
      'Velocity threshold breached',
    ]);
    t.amount = Math.round(persona.monthlyIncome * (1 + rand(seed, 4000 + i) * 2));
    t.description = `FLAGGED: ${t.description}`;
  }

  return txns;
}

function generateAuditLogs(persona, accounts, txns) {
  const seed = persona.id;
  const logs = [];
  const location = pick(seed, 1, CITIES);

  // Login events
  for (let i = 0; i < 8; i++) {
    const d = randomDateInRange(new Date(Date.now() - 90 * 86400000), new Date(), seed, 5000 + i);
    logs.push({
      action: 'LOGIN',
      entityType: 'auth',
      entityId: null,
      newValue: JSON.stringify({ status: 200, device: i === 0 ? 'trusted-laptop' : `mobile-${i}` }),
      ipAddress: `203.192.${Math.floor(rand(seed, 6000 + i) * 255)}.${Math.floor(rand(seed, 7000 + i) * 255)}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      createdAt: d.toISOString(),
      city: location.city,
      country: location.country,
    });
  }

  // Transaction audit events
  txns.slice(-20).forEach((t, i) => {
    logs.push({
      action: t.riskLevel === 'HIGH' ? 'FLAG' : 'CREATE',
      entityType: 'transaction',
      entityId: null,
      newValue: JSON.stringify({ type: t.type, amount: t.amount, description: t.description, status: t.riskLevel === 'HIGH' ? 403 : 200 }),
      ipAddress: `203.192.${Math.floor(rand(seed, 8000 + i) * 255)}.${Math.floor(rand(seed, 9000 + i) * 255)}`,
      userAgent: 'SecureWealth-MobileApp/2.0',
      createdAt: t.createdAt,
      city: location.city,
      country: location.country,
    });
  });

  // Account creation
  accounts.forEach((acc, i) => {
    logs.push({
      action: 'CREATE',
      entityType: 'account',
      entityId: null,
      newValue: JSON.stringify({ type: acc.type, balance: acc.balance, accountNumber: maskAccountNumber(acc.accountNumber) }),
      ipAddress: `203.192.${Math.floor(rand(seed, 10000 + i) * 255)}.${Math.floor(rand(seed, 11000 + i) * 255)}`,
      userAgent: 'SecureWealth-Web/2.0',
      createdAt: new Date(Date.now() - 365 * 86400000 + i * 86400000).toISOString(),
      city: location.city,
      country: location.country,
    });
  });

  return logs;
}

function generateFraudEvents(persona, txns) {
  const seed = persona.id;
  const events = [];
  const riskyTxns = txns.filter(t => t.riskLevel === 'HIGH').slice(0, 3);
  const riskyLocation = pick(seed, 1, RISKY_LOCATIONS);

  riskyTxns.forEach((t, i) => {
    const cleanDescription = t.description.startsWith('FLAGGED: ') ? t.description.slice(9) : t.description;
    events.push({
      action: 'FLAG',
      entityType: 'transaction',
      entityId: null,
      newValue: JSON.stringify({
        status: 403,
        amount: t.amount,
        description: `FLAGGED: ${cleanDescription}`,
        riskScore: 75 + Math.floor(rand(seed, 12000 + i) * 25),
        signals: [t.riskReason],
      }),
      ipAddress: `41.${Math.floor(rand(seed, 13000 + i) * 255)}.${Math.floor(rand(seed, 14000 + i) * 255)}.${Math.floor(rand(seed, 15000 + i) * 255)}`,
      userAgent: 'SecureWealth-MobileApp/2.0',
      createdAt: t.createdAt,
      city: riskyLocation.city,
      country: riskyLocation.country,
      lat: riskyLocation.lat,
      lon: riskyLocation.lon,
    });
  });

  return events;
}

module.exports = {
  PERSONAS,
  DEMO_PASSWORD,
  generateAccounts,
  generateAssets,
  generateGoals,
  generateTransactions,
  generateAuditLogs,
  generateFraudEvents,
  maskAccountNumber,
};
