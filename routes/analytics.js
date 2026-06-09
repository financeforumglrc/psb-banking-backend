/**
 * Analytics API Routes
 * Usage tracking, patent analytics, business intelligence
 */

const express = require('express');
const router = express.Router();

// In-memory analytics store (replace with database in production)
const MAX_ANALYTICS_STORE_SIZE = 100000;
const analyticsStore = {
    apiCalls: [],
    patentUsage: new Map(),
    userActivity: new Map()
};

function addApiCall(call) {
    analyticsStore.apiCalls.push(call);
    // Prevent unbounded memory growth
    if (analyticsStore.apiCalls.length > MAX_ANALYTICS_STORE_SIZE) {
        analyticsStore.apiCalls = analyticsStore.apiCalls.slice(-MAX_ANALYTICS_STORE_SIZE / 2);
    }
}

/**
 * @route   GET /api/v1/analytics/usage
 * @desc    Get API usage statistics
 * @access  Private (Admin)
 */
router.get('/usage', (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Filter by date range if provided
        let calls = analyticsStore.apiCalls;
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            calls = calls.filter(c => {
                const date = new Date(c.timestamp);
                return date >= start && date <= end;
            });
        }

        // Aggregate statistics
        const stats = {
            totalCalls: calls.length,
            uniqueUsers: new Set(calls.map(c => c.userId)).size,
            endpoints: {},
            patents: {},
            hourlyDistribution: new Array(24).fill(0),
            dailyTrend: {}
        };

        calls.forEach(call => {
            // Endpoint stats
            stats.endpoints[call.endpoint] = (stats.endpoints[call.endpoint] || 0) + 1;
            
            // Patent stats
            if (call.patent) {
                stats.patents[call.patent] = (stats.patents[call.patent] || 0) + 1;
            }
            
            // Hourly distribution
            const hour = new Date(call.timestamp).getHours();
            stats.hourlyDistribution[hour]++;
            
            // Daily trend
            const day = call.timestamp.split('T')[0];
            stats.dailyTrend[day] = (stats.dailyTrend[day] || 0) + 1;
        });

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Analytics retrieval failed'
        });
    }
});

/**
 * @route   GET /api/v1/analytics/patents
 * @desc    Get patent usage analytics
 * @access  Private (Admin)
 */
router.get('/patents', (req, res) => {
    try {
        const patentStats = {
            totalPatents: 47,
            activePatents: 7,
            usageByPatent: {},
            revenueByPatent: {},
            licensingDeals: []
        };

        // Aggregate patent usage
        analyticsStore.apiCalls.forEach(call => {
            if (call.patent) {
                if (!patentStats.usageByPatent[call.patent]) {
                    patentStats.usageByPatent[call.patent] = {
                        calls: 0,
                        uniqueUsers: new Set()
                    };
                }
                patentStats.usageByPatent[call.patent].calls++;
                patentStats.usageByPatent[call.patent].uniqueUsers.add(call.userId);
            }
        });

        // Convert Sets to counts
        Object.keys(patentStats.usageByPatent).forEach(key => {
            patentStats.usageByPatent[key].uniqueUsers = patentStats.usageByPatent[key].uniqueUsers.size;
        });

        res.json({
            success: true,
            data: patentStats
        });
    } catch (error) {
        console.error('Patent analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Patent analytics failed'
        });
    }
});

/**
 * @route   GET /api/v1/analytics/dashboard
 * @desc    Get executive dashboard data
 * @access  Private (Admin)
 */
router.get('/dashboard', (req, res) => {
    try {
        const dashboard = {
            overview: {
                totalUsers: 0,
                activeUsers: 0,
                totalApiCalls: analyticsStore.apiCalls.length,
                revenue: 0,
                patentsFiled: 7,
                patentsPending: 40
            },
            topPatents: [],
            recentActivity: analyticsStore.apiCalls.slice(-10),
            growthMetrics: {
                userGrowth: 0,
                revenueGrowth: 0,
                apiGrowth: 0
            }
        };

        res.json({
            success: true,
            data: dashboard
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Dashboard retrieval failed'
        });
    }
});

module.exports = router;
