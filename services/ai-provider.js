/**
 * AI Provider Dispatcher for dsFinancial
 * Routes tasks to the correct adapter (Gemini default, BYOK fallback)
 */

const adapters = {
    gemini: require('./adapters/gemini-adapter'),
    anthropic: require('./adapters/anthropic-adapter'),
    openai: require('./adapters/openai-adapter'),
};

const TASK_DEFAULTS = {
    extract: { provider: 'gemini', model: 'gemini-2.5-flash' },
    chat: { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
    explain: { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
    memo: { provider: 'gemini', model: 'gemini-2.5-flash' },
};

// Cost per 1K tokens (USD) — approximate
const COST_RATES = {
    'gemini-2.5-flash': { input: 0.0003, output: 0.0006 },
    'gemini-2.5-flash-lite': { input: 0.00015, output: 0.0003 },
    'claude-sonnet-4-7': { input: 0.003, output: 0.015 },
    'claude-haiku-4-5-20251001': { input: 0.00025, output: 0.00125 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

function estimateCost(model, inputTokens, outputTokens) {
    const rates = COST_RATES[model] || { input: 0.001, output: 0.002 };
    return ((inputTokens / 1000) * rates.input) + ((outputTokens / 1000) * rates.output);
}

async function callAI(task, opts) {
    const startTime = Date.now();
    const defaultConfig = TASK_DEFAULTS[task] || TASK_DEFAULTS.chat;

    // Determine provider: BYOK overrides server default
    let provider = defaultConfig.provider;
    let model = defaultConfig.model;
    let apiKey = null;

    if (opts.byok) {
        provider = opts.byok.provider;
        apiKey = opts.byok.key;
        model = opts.byok.model || defaultConfig.model;
    }

    const adapter = adapters[provider];
    if (!adapter) throw new Error(`Unknown AI provider: ${provider}`);

    let result;
    let success = true;
    let errorMessage = null;
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    try {
        const adapterOpts = { ...opts, model, apiKey };
        result = await adapter[task](adapterOpts);

        if (result.usage) {
            usage = result.usage;
        }

        // Handle streaming result wrappers
        if (task === 'chat' && opts.stream && result.on) {
            // Streaming object returned directly — caller handles it
            return { stream: result, provider, model };
        }
    } catch (err) {
        success = false;
        errorMessage = err.message;

        // Retry with exponential backoff on 429
        if (err.status === 429 || err.message.includes('429')) {
            const delay = Math.pow(2, (opts.retryCount || 0)) * 1000;
            if ((opts.retryCount || 0) < 3) {
                await new Promise((r) => setTimeout(r, delay));
                return callAI(task, { ...opts, retryCount: (opts.retryCount || 0) + 1 });
            }
        }

        throw err;
    }

    const latencyMs = Date.now() - startTime;
    const costUsd = estimateCost(model, usage.inputTokens, usage.outputTokens);

    // Log to database if available
    try {
        const { aiRunsDb } = require('./database');
        aiRunsDb.create({
            deviceId: opts.deviceId || 'anonymous',
            task,
            provider,
            model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            latencyMs,
            costUsd,
            success,
            errorMessage,
        });
    } catch (e) {
        // Logging failure should not break the request
    }

    return { ...result, provider, model, latencyMs, costUsd };
}

module.exports = { callAI, TASK_DEFAULTS, adapters };
