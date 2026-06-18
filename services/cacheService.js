/**
 * Cache Service
 * Redis-based caching with an in-memory fallback for local dev / free-tier deploys.
 * Supports REDIS_URL (Render/Upstash) or REDIS_HOST + REDIS_PORT.
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
        this.connected = false;

        if (Redis) {
            try {
                const redisUrl = process.env.REDIS_URL;
                if (redisUrl) {
                    this.client = new Redis(redisUrl, {
                        retryStrategy: (times) => Math.min(times * 50, 2000),
                        maxRetriesPerRequest: 3,
                        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
                    });
                } else {
                    this.client = new Redis({
                        host: process.env.REDIS_HOST || 'localhost',
                        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
                        retryStrategy: (times) => Math.min(times * 50, 2000),
                        maxRetriesPerRequest: 3
                    });
                }

                this.client.on('connect', () => {
                    this.connected = true;
                    console.log('Redis connected');
                });

                this.client.on('error', (err) => {
                    this.connected = false;
                    console.error('Redis error:', err.message);
                });
            } catch (err) {
                console.warn('Redis initialization failed, using in-memory fallback:', err.message);
                this.client = null;
            }
        }

        // Cache TTLs in seconds
        this.TTL = {
            GSTIN_VALIDATION: 3600,
            TAX_CALCULATION: 1800,
            TAX_SLABS: 86400,
            AI_RESPONSE: 600,
            HSN_RATES: 86400,
            USER_SESSION: 604800,
            RATE_LIMIT: 900,
            MARKET_QUOTE: 300,
            MARKET_HISTORICAL: 900,
            SCREENER_COMPANY: 1800,
            BANKING_ACCOUNTS: 120,
            BANKING_TRANSACTIONS: 120,
            BUSINESS_CASHFLOW: 300,
            FINANCIAL_MODEL: 3600,
            USER_PROFILE: 300
        };
    }

    _fallbackGet(key) {
        const entry = this.fallbackCache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.fallbackCache.delete(key);
            return null;
        }
        return entry.value;
    }

    _fallbackSet(key, value, ttl) {
        this.fallbackCache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
        return true;
    }

    async get(key) {
        if (this.client) {
            try {
                const data = await this.client.get(key);
                return data ? JSON.parse(data) : null;
            } catch (error) {
                console.error('Cache get error:', error.message);
                return this._fallbackGet(key);
            }
        }
        return this._fallbackGet(key);
    }

    async set(key, value, ttl = 3600) {
        if (this.client) {
            try {
                await this.client.setex(key, ttl, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('Cache set error:', error.message);
                return this._fallbackSet(key, value, ttl);
            }
        }
        return this._fallbackSet(key, value, ttl);
    }

    async delete(key) {
        this.fallbackCache.delete(key);
        if (this.client) {
            try {
                await this.client.del(key);
                return true;
            } catch (error) {
                console.error('Cache delete error:', error.message);
                return false;
            }
        }
        return true;
    }

    async exists(key) {
        if (this.client) {
            try {
                return await this.client.exists(key);
            } catch (error) {
                console.error('Cache exists error:', error.message);
                return this._fallbackGet(key) ? 1 : 0;
            }
        }
        return this._fallbackGet(key) ? 1 : 0;
    }

    async incrementRateLimit(identifier, endpoint, windowSeconds = 900) {
        const key = this.getRateLimitKey(identifier, endpoint);
        if (this.client) {
            try {
                const current = await this.client.incr(key);
                if (current === 1) await this.client.expire(key, windowSeconds);
                return current;
            } catch (error) {
                console.error('Cache rate-limit increment error:', error.message);
            }
        }
        const current = (this._fallbackGet(key) || 0) + 1;
        this._fallbackSet(key, current, windowSeconds);
        return current;
    }

    async getRateLimitCount(identifier, endpoint) {
        const key = this.getRateLimitKey(identifier, endpoint);
        if (this.client) {
            try {
                const count = await this.client.get(key);
                return parseInt(count) || 0;
            } catch (error) {
                console.error('Cache rate-limit count error:', error.message);
                return this._fallbackGet(key) || 0;
            }
        }
        return this._fallbackGet(key) || 0;
    }

    async flush() {
        this.fallbackCache.clear();
        if (this.client) {
            try {
                await this.client.flushall();
                return true;
            } catch (error) {
                console.error('Cache flush error:', error.message);
                return false;
            }
        }
        return true;
    }

    async getStats() {
        if (this.client) {
            try {
                return { provider: 'redis', info: await this.client.info() };
            } catch (error) {
                console.error('Cache stats error:', error.message);
                return { provider: 'fallback', size: this.fallbackCache.size };
            }
        }
        return { provider: 'fallback', size: this.fallbackCache.size };
    }

    getGSTINKey(gstin) {
        return `gstin:${gstin.toUpperCase()}`;
    }

    getTaxCalcKey(profile) {
        const hash = Buffer.from(JSON.stringify(profile)).toString('base64').substring(0, 32);
        return `tax:${hash}`;
    }

    getSessionKey(userId) {
        return `session:${userId}`;
    }

    getRateLimitKey(identifier, endpoint) {
        return `ratelimit:${identifier}:${endpoint}`;
    }

    getMarketQuoteKey(ticker) {
        return `market:quote:${ticker.toUpperCase()}`;
    }

    getMarketHistoricalKey(ticker, range) {
        return `market:historical:${ticker.toUpperCase()}:${range}`;
    }

    getScreenerCompanyKey(ticker) {
        return `screener:company:${ticker.toUpperCase()}`;
    }

    getBankingAccountsKey(userId) {
        return `banking:accounts:${userId}`;
    }

    getBankingTransactionsKey(userId, limit) {
        return `banking:transactions:${userId}:${limit || 'all'}`;
    }

    getBusinessCashflowKey(userId) {
        return `banking:business:cashflow:${userId}`;
    }

    getFinancialModelKey(inputHash) {
        return `financial:model:${inputHash}`;
    }

    getUserProfileKey(userId) {
        return `user:profile:${userId}`;
    }

    async cacheGSTINValidation(gstin, result) {
        const key = this.getGSTINKey(gstin);
        return this.set(key, result, this.TTL.GSTIN_VALIDATION);
    }

    async getGSTINValidation(gstin) {
        const key = this.getGSTINKey(gstin);
        return this.get(key);
    }

    async cacheTaxCalculation(profile, result) {
        const key = this.getTaxCalcKey(profile);
        return this.set(key, result, this.TTL.TAX_CALCULATION);
    }

    async getTaxCalculation(profile) {
        const key = this.getTaxCalcKey(profile);
        return this.get(key);
    }
}

module.exports = new CacheService();
