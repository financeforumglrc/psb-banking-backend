/**
 * Payment Service
 * Razorpay integration for subscriptions
 */

let Razorpay;
try {
    Razorpay = require('razorpay');
} catch (e) {
    console.warn('razorpay not installed. Payment service will operate in fallback mode.');
}

class PaymentService {
    constructor() {
        this.razorpay = null;
        if (Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
            this.razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });
        } else {
            console.warn('Razorpay not configured. Payment service in fallback mode.');
        }

        this.plans = {
            free: {
                name: 'Free',
                price: 0,
                apiCalls: 100,
                features: ['Basic GST validation', 'Income tax calculator']
            },
            basic: {
                name: 'Basic',
                price: 49900, // ₹499 in paise
                apiCalls: 1000,
                features: ['All free features', 'ITC risk scanner', 'Tax optimizer']
            },
            premium: {
                name: 'Premium',
                price: 149900, // ₹1499 in paise
                apiCalls: 10000,
                features: ['All basic features', 'AI advisor', 'Shell company detection', 'Priority support']
            },
            enterprise: {
                name: 'Enterprise',
                price: 499900, // ₹4999 in paise
                apiCalls: 100000,
                features: ['All premium features', 'API access', 'White-label', 'Dedicated support']
            }
        };
    }

    async createOrder(planId, userId) {
        const plan = this.plans[planId];
        if (!plan) throw new Error('Invalid plan');
        if (!this.razorpay) {
            return { id: `fallback_order_${Date.now()}`, amount: plan.price, currency: 'INR', status: 'created' };
        }

        const order = await this.razorpay.orders.create({
            amount: plan.price,
            currency: 'INR',
            receipt: `order_${userId}_${Date.now()}`,
            notes: {
                userId,
                planId
            }
        });

        return order;
    }

    async verifyPayment(paymentId, orderId, signature) {
        const crypto = require('crypto');
        const body = orderId + '|' + paymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        return expectedSignature === signature;
    }

    async createSubscription(planId, userId) {
        const plan = this.plans[planId];
        if (!plan) throw new Error('Invalid plan');
        
        // In production, plan_id should be the actual Razorpay plan ID, not internal key
        const razorpayPlanId = process.env[`RAZORPAY_PLAN_${planId.toUpperCase()}`];
        if (!razorpayPlanId) {
            throw new Error(`Razorpay plan ID not configured for plan: ${planId}. Set RAZORPAY_PLAN_${planId.toUpperCase()} environment variable.`);
        }
        if (!this.razorpay) {
            return { id: `fallback_sub_${Date.now()}`, status: 'created', plan_id: razorpayPlanId };
        }

        const subscription = await this.razorpay.subscriptions.create({
            plan_id: razorpayPlanId,
            customer_notify: 1,
            total_count: 12,
            notes: {
                userId
            }
        });

        return subscription;
    }

    getPlans() {
        return Object.entries(this.plans).map(([id, plan]) => ({
            id,
            ...plan,
            priceDisplay: `₹${(plan.price / 100).toLocaleString('en-IN')}`
        }));
    }
}

module.exports = new PaymentService();
