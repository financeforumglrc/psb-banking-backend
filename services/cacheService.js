/**
 * Cache Service
 * Redis-based caching for API responses
 */

let Redis;
try {
    Redis = require('ioredis');
} catch (e) {
    console.warn('ioredis not installed. Cache service will operate in fallback mode.');
}

class CacheService {
    constructor() {
        this.fallbackCache = new Map();
        this.client = null;
        
        if (Redis) {
            try {
                this.client = new Redis({
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    retryStrategy: (times) => {
                        const delay = Math.min(times * 50, 2000);
                        return delay;
                    },
                    maxRetriesPerRequest: 3
                });

                this.client.on('connect', () => {
                    console.log('Redis connected');
                });

                this.client.on('error', (err) => {
                    console.error('Redis error:', err.message);
                });
            } catch (err) {
                console.warn('Redis initialization failed, using in-memory fallback:', err.message);
            }
        }

        // Cache TTLs in seconds
        this.TTL = {
            GSTIN_VALIDATION: 3600,      // 1 hour
            TAX_CALCULATION: 1800,       // 30 minutes
            TAX_SLABS: 86400,            // 24 hours
            AI_RESPONSE: 600,            // 10 minutes
            HSN_RATES: 86400,            // 24 hours
            USER_SESSION: 604800,        // 7 days
            RATE_LIMIT: 900              // 15 minutes
        };
    }

    /**
     * Get cached data
     */
    async get(key) {
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Cache get error:', error.message);
            return null;
        }
    }

    /**
     * Set cached data with TTL
     */
    async set(key, value, ttl = 3600) {
        try {
            await this.client.setex(key, ttl, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Cache set error:', error.message);
            return false;
        }
    }

    /**
     * Delete cached data
     */
    async delete(key) {
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('Cache delete error:', error.message);
            return false;
        }
    }

    /**
     * Check if key exists
     */
    async exists(key) {
        try {
            return await this.client.exists(key);
        } catch (error) {
            console.error('Cache exists error:', error.message);
            return 0;
        }
    }

    /**
     * Generate cache key for GSTIN validation
     */
    getGSTINKey(gstin) {
        return `gstin:${gstin.toUpperCase()}`;
    }

    /**
     * Generate cache key for tax calculation
     */
    getTaxCalcKey(profile) {
        const hash = Buffer.from(JSON.stringify(profile)).toString('base64').substring(0, 32);
        return `tax:${hash}`;
    }

    /**
     * Generate cache key for user session
     */
    getSessionKey(userId) {
        return `session:${userId}`;
    }

    /**
     * Generate cache key for rate limiting
     */
    getRateLimitKey(identifier, endpoint) {
        return `ratelimit:${identifier}:${endpoint}`;
    }

    /**
     * Increment rate limit counter
     */
    async incrementRateLimit(identifier, endpoint, windowSeconds = 900) {
        const key = this.getRateLimitKey(identifier, endpoint);
        const current = await this.client.incr(key);
        if (current === 1) {
            await this.client.expire(key, windowSeconds);
        }
        return current;
    }

    /**
     * Get rate limit count
     */
    async getRateLimitCount(identifier, endpoint) {
        const key = this.getRateLimitKey(identifier, endpoint);
        const count = await this.client.get(key);
        return parseInt(count) || 0;
    }

    /**
     * Cache GSTIN validation result
     */
    async cacheGSTINValidation(gstin, result) {
        const key = this.getGSTINKey(gstin);
        return this.set(key, result, this.TTL.GSTIN_VALIDATION);
    }

    /**
     * Get cached GSTIN validation
     */
    async getGSTINValidation(gstin) {
        const key = this.getGSTINKey(gstin);
        return this.get(key);
    }

    /**
     * Cache tax calculation
     */
    async cacheTaxCalculation(profile, result) {
        const key = this.getTaxCalcKey(profile);
        return this.set(key, result, this.TTL.TAX_CALCULATION);
    }

    /**
     * Get cached tax calculation
     */
    async getTaxCalculation(profile) {
        const key = this.getTaxCalcKey(profile);
        return this.get(key);
    }

    /**
     * Clear all cache
     */
    async flush() {
        try {
            await this.client.flushall();
            return true;
        } catch (error) {
            console.error('Cache flush error:', error.message);
            return false;
        }
    }

    /**
     * Get cache stats
     */
    async getStats() {
        try {
            return await this.client.info();
        } catch (error) {
            console.error('Cache stats error:', error.message);
            return null;
        }
    }
}

// Singleton instance
module.exports = new CacheService();
