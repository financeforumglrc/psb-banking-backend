/**
 * SecureWealth Twin — Protection API routes (Node fallback for the FastAPI microservice)
 * Mirrors the Python protection service so the frontend can use a single production origin.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// Risk engine
// ═══════════════════════════════════════════════════════════════
function biometricBonus(deviation) {
  if (deviation > 0.6) return 20;
  if (deviation > 0.35) return 10;
  return 0;
}

function evaluateWealthProtection(req) {
  let riskScore = 0;
  const factors = [];

  if (!req.is_trusted_device) {
    riskScore += 20;
    factors.push('Action initiated from an unrecognized/new device.');
  }
  if (req.seconds_since_login < 10) {
    riskScore += 25;
    factors.push(`High-value action taken unusually fast (${req.seconds_since_login}s after login).`);
  }
  if (req.amount > (req.historical_avg_amount * 2)) {
    riskScore += 30;
    factors.push(`Amount ₹${req.amount.toLocaleString('en-IN')} is significantly higher than your usual pattern.`);
  }
  if (req.otp_attempts > 1) {
    riskScore += (req.otp_attempts - 1) * 15;
    factors.push(`Multiple OTP attempts detected (${req.otp_attempts} tries).`);
  }
  if (req.is_first_time_investment) {
    riskScore += 15;
    factors.push('This is a first-time payee or investment type for your account.');
  }
  if (req.retry_count > 0) {
    riskScore += req.retry_count * 10;
    factors.push(`Unusual retry/cancel pattern observed (${req.retry_count} retries).`);
  }

  const bioBonus = biometricBonus(req.behavioral_deviation || 0);
  if (bioBonus) {
    riskScore += bioBonus;
    factors.push('Behavioral biometrics deviation detected (typing/mouse rhythm mismatch).');
  }

  const graphBonus = req.graph_risk_bonus || 0;
  if (graphBonus) {
    riskScore += graphBonus;
    factors.push('Network graph analysis flagged a connection to a known fraud pattern.');
  }

  riskScore = Math.min(riskScore, 100);

  let level, action, message;
  if (riskScore < 30) {
    level = 'LOW';
    action = 'ALLOW';
    message = 'Transaction approved. Stay secure!';
  } else if (riskScore < 60) {
    level = 'MEDIUM';
    action = 'WARN_COOL_OFF';
    message = '🛡️ Security Pause: For your safety, this action is on a 15-minute cooling-off period. We have sent an OTP to verify.';
  } else {
    level = 'HIGH';
    action = 'BLOCK';
    message = '🛑 Action Temporarily Blocked: Unusual activity detected. Please contact support or try again in 24 hours.';
  }

  if (factors.length === 0) {
    factors.push('No risk signals detected — transaction matches your normal patterns.');
  }

  return {
    risk_score: riskScore,
    risk_level: level,
    action,
    explainable_factors: factors,
    user_message: message,
    reference_id: 'SWT-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Graph risk engine
// ═══════════════════════════════════════════════════════════════
class FraudGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this._seed();
  }

  _seed() {
    const fraudster = 'fraudster_1';
    const device = 'device_fraud_abc123';
    const mules = ['mule_ramesh', 'mule_suresh', 'mule_vikram'];
    this._addNode(fraudster, 'user');
    this._addNode(device, 'device');
    this._addEdge(fraudster, device, 'uses');
    for (const mule of mules) {
      this._addNode(mule, 'user');
      this._addEdge(mule, device, 'uses');
      this._addEdge(fraudster, mule, 'recruits');
    }
  }

  _addNode(id, kind) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, kind);
      this.edges.set(id, new Set());
    }
  }

  _addEdge(a, b, relation) {
    this._addNode(a, 'unknown');
    this._addNode(b, 'unknown');
    this.edges.get(a).add(JSON.stringify({ to: b, relation }));
    this.edges.get(b).add(JSON.stringify({ to: a, relation }));
  }

  _fingerprint(value) {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  _neighbors(node) {
    const out = [];
    for (const raw of (this.edges.get(node) || [])) {
      out.push(JSON.parse(raw).to);
    }
    return out;
  }

  _hasPath(start, target) {
    if (!this.nodes.has(start) || !this.nodes.has(target)) return false;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === target) return true;
      for (const n of this._neighbors(cur)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return false;
  }

  _componentSize(start) {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const n of this._neighbors(cur)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return seen.size;
  }

  analyze(userId, payee, deviceFingerprint) {
    const userNode = `user_${this._fingerprint(userId)}`;
    const payeeNode = `payee_${this._fingerprint(payee)}`;
    const deviceNode = deviceFingerprint ? `device_${this._fingerprint(deviceFingerprint)}` : null;

    this._addNode(userNode, 'user');
    this._addNode(payeeNode, 'payee');
    this._addEdge(userNode, payeeNode, 'pays');

    if (deviceNode) {
      this._addNode(deviceNode, 'device');
      this._addEdge(userNode, deviceNode, 'uses');
    }

    let linkedToFraudDevice = false;
    let ringSize = 0;
    let reason = 'No graph risk detected.';

    if (deviceNode && this._hasPath(deviceNode, 'device_fraud_abc123')) {
      linkedToFraudDevice = true;
      ringSize = this._componentSize(deviceNode);
      reason = `This device or payee shares a connection with a known fraud ring of ${ringSize} nodes.`;
    } else if (this._hasPath(payeeNode, 'fraudster_1')) {
      linkedToFraudDevice = true;
      ringSize = this._componentSize(payeeNode);
      reason = `Payee is linked to a known fraudster through a network of ${ringSize} nodes.`;
    }

    return {
      linked_to_fraud_device: linkedToFraudDevice,
      ring_size: ringSize,
      risk_bonus: linkedToFraudDevice ? 25 : 0,
      reason,
    };
  }
}

const fraudGraph = new FraudGraph();

// ═══════════════════════════════════════════════════════════════
// Account Aggregator mock data
// ═══════════════════════════════════════════════════════════════
const PERSONA_ACCOUNTS = {
  hni: [
    { bank: 'HDFC Bank', type: 'Family Office Account', amount: '₹2,10,00,000', icon: '🏦' },
    { bank: 'ICICI Direct', type: 'Equity Portfolio', amount: '₹1,85,50,000', icon: '💹' },
    { bank: 'Bajaj Allianz', type: 'ULIP Policy', amount: '₹78,00,000', icon: '🛡️' },
    { bank: 'Zerodha', type: 'International ETFs', amount: '₹50,50,000', icon: '📈' },
  ],
  tech: [
    { bank: 'SBI', type: 'Salary Account', amount: '₹4,20,000', icon: '🏦' },
    { bank: 'Zerodha', type: 'Equity + ETFs', amount: '₹95,50,000', icon: '💹' },
    { bank: 'HDFC Mutual', type: 'Tax Saver ELSS', amount: '₹42,00,000', icon: '📈' },
    { bank: 'LIC', type: 'Term + Endowment', amount: '₹42,30,000', icon: '🛡️' },
  ],
  business: [
    { bank: 'ICICI Current', type: 'Business Account', amount: '₹62,00,000', icon: '🏦' },
    { bank: 'Axis Mutual', type: 'Liquid Funds', amount: '₹48,00,000', icon: '📈' },
    { bank: 'Zerodha', type: 'Equity Portfolio', amount: '₹85,00,000', icon: '💹' },
    { bank: 'HDFC Life', type: 'Income Replacement', amount: '₹50,00,000', icon: '🛡️' },
  ],
  farmer: [
    { bank: 'Punjab & Sind Bank', type: 'Kisan Account', amount: '₹3,20,000', icon: '🏦' },
    { bank: 'PM-KISAN', type: 'Government Benefit', amount: '₹1,20,000', icon: '🇮🇳' },
    { bank: 'NABARD Deposit', type: 'Term Deposit', amount: '₹8,50,000', icon: '📈' },
    { bank: 'LIC Jeevan', type: 'Life Cover', amount: '₹15,60,000', icon: '🛡️' },
  ],
  student: [
    { bank: 'SBI Youth', type: 'Student Account', amount: '₹42,000', icon: '🏦' },
    { bank: 'Groww', type: 'Digital Gold', amount: '₹18,000', icon: '🪙' },
    { bank: 'PPF', type: 'Small Savings', amount: '₹75,000', icon: '📈' },
    { bank: 'PhonePe', type: 'Wallet + UPI', amount: '₹15,000', icon: '📱' },
  ],
  senior: [
    { bank: 'Bank of Baroda', type: 'Pension Account', amount: '₹2,80,000', icon: '🏦' },
    { bank: 'Post Office', type: 'Senior Citizen FD', amount: '₹22,00,000', icon: '📮' },
    { bank: 'LIC Pension', type: 'Annuity Plan', amount: '₹12,00,000', icon: '🛡️' },
    { bank: 'SBI RD', type: 'Recurring Deposit', amount: '₹5,20,000', icon: '📈' },
  ],
};

const DEFAULT_ACCOUNTS = [
  { bank: 'State Bank of India (SBI)', type: 'Savings Account', amount: '₹45,200', icon: '🏦' },
  { bank: 'HDFC Bank', type: 'Mutual Funds', amount: '₹1,20,000', icon: '📈' },
  { bank: 'Zerodha', type: 'Equity Portfolio', amount: '₹85,500', icon: '💹' },
  { bank: 'LIC of India', type: 'Endowment Policy', amount: '₹50,000', icon: '🛡️' },
];

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'securewealth-protection' });
});

router.post('/api/v1/protect-wealth-action', (req, res) => {
  try {
    const result = evaluateWealthProtection(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/graph-risk', (req, res) => {
  try {
    const { user_id, payee, device_fingerprint } = req.body || {};
    const result = fraudGraph.analyze(user_id || 'unknown', payee || 'unknown', device_fingerprint);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/biometric-risk', (req, res) => {
  try {
    const deviation = Number((req.body || {}).deviation) || 0;
    const bonus = biometricBonus(deviation);
    let anomaly = 'none';
    let reason = 'Behavioral profile matches baseline.';
    if (deviation > 0.6) {
      anomaly = 'high';
      reason = 'Behavioral profile shows high deviation.';
    } else if (deviation > 0.35) {
      anomaly = 'low';
      reason = 'Behavioral profile shows moderate deviation.';
    }
    res.json({ risk_bonus: bonus, anomaly, reason });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/aa/fetch', (req, res) => {
  try {
    const persona = req.query.persona;
    const steps = PERSONA_ACCOUNTS[persona] || DEFAULT_ACCOUNTS;
    const total = steps.reduce((sum, item) => {
      const value = Number(item.amount.replace(/[₹,]/g, '')) || 0;
      return sum + value;
    }, 0);
    res.json({
      steps,
      total_net_worth: `₹${total.toLocaleString('en-IN')}`,
      message: 'Welcome back! I\'ve aggregated your unified financial picture. Your SecureWealth Twin is now monitoring across all linked institutions.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/guardian-message', (req, res) => {
  try {
    const { risk_level, action, amount, payee } = req.body || {};
    const amountStr = `₹${Number(amount || 0).toLocaleString('en-IN')}`;
    const payeeStr = payee || 'this contact';

    let message;
    if (action === 'ALLOW') {
      message = `✅ Your ${amountStr} request to ${payeeStr} looks safe. It matches your usual patterns and trusted device.`;
    } else if (action === 'WARN_COOL_OFF') {
      message = `🛡️ Security Pause: I noticed you're moving ${amountStr} to ${payeeStr} in a way that doesn't quite match your normal habits. To protect your wealth, I've placed this on a short cooling-off period. Please verify the OTP I just sent to your registered mobile.`;
    } else {
      message = `🛑 I can't let this ${amountStr} transfer to ${payeeStr} proceed right now. Multiple risk signals are active. Please review your recent notifications or contact support — your money stays safe.`;
    }

    res.json({ message, source: 'template' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
