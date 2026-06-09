/**
 * Calculation History Model
 * Stores all tax/GST calculations for audit and analytics
 * NOTE: This file requires 'mongoose' to be installed. The app currently uses SQLite.
 */

let mongoose;
try {
    mongoose = require('mongoose');
} catch (e) {
    console.warn('mongoose not installed. MongoDB models are inactive. App uses SQLite via services/database.js');
}

if (!mongoose) {
    module.exports = {};
} else {

const calculationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: [
            'income_tax',
            'gst',
            'hra',
            'capital_gains',
            'tds',
            'advance_tax',
            'gstin_validation',
            'itc_reconciliation',
            'shell_company_detection',
            'tax_rate_verification',
            'itc_recovery_prediction'
        ],
        index: true
    },
    patent: {
        type: String,
        enum: ['PAT-001', 'PAT-002', 'PAT-003', 'PAT-004', 'PAT-005', 'PAT-006', 'PAT-007', null],
        default: null
    },
    inputs: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    outputs: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    metadata: {
        ipAddress: String,
        userAgent: String,
        apiVersion: { type: String, default: '2.0' },
        processingTime: Number, // milliseconds
        algorithmVersion: String
    },
    tags: [{
        type: String,
        index: true
    }],
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Compound indexes for common queries
calculationSchema.index({ user: 1, type: 1, createdAt: -1 });
calculationSchema.index({ user: 1, patent: 1 });
calculationSchema.index({ type: 1, createdAt: -1 });
calculationSchema.index({ patent: 1, createdAt: -1 });

// Static method to get user's calculation stats
calculationSchema.statics.getUserStats = async function(userId) {
    return this.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId), isDeleted: false } },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
                lastUsed: { $max: '$createdAt' }
            }
        }
    ]);
};

// Static method to get patent usage analytics
calculationSchema.statics.getPatentAnalytics = async function(startDate, endDate) {
    const match = { patent: { $ne: null } };
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$patent',
                totalCalls: { $sum: 1 },
                uniqueUsers: { $addToSet: '$user' },
                avgProcessingTime: { $avg: '$metadata.processingTime' }
            }
        },
        {
            $project: {
                patent: '$_id',
                totalCalls: 1,
                uniqueUsers: { $size: '$uniqueUsers' },
                avgProcessingTime: { $round: ['$avgProcessingTime', 2] }
            }
        }
    ]);
};

    module.exports = mongoose.model('Calculation', calculationSchema);
}
