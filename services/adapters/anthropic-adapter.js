/**
 * Anthropic Adapter for dsFinancial AI Provider (BYOK only)
 */

const Anthropic = require('@anthropic-ai/sdk');

function getClient(apiKey) {
    if (!apiKey) throw new Error('Anthropic API key required for BYOK');
    return new Anthropic({ apiKey });
}

async function extract({ pdfBuffer, prompt, model = 'claude-sonnet-4-7', apiKey }) {
    const client = getClient(apiKey);
    const result = await client.messages.create({
        model,
        max_tokens: 4096,
        system: 'You are a financial data extraction engine. Return STRICT JSON only. No preamble. No markdown fences.',
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
                    { type: 'text', text: prompt },
                ],
            },
        ],
    });

    const text = result.content[0].text;
    const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));

    return {
        json,
        usage: {
            inputTokens: result.usage.input_tokens,
            outputTokens: result.usage.output_tokens,
            totalTokens: result.usage.input_tokens + result.usage.output_tokens,
        },
    };
}

async function chat({ messages, system, model = 'claude-haiku-4-5-20251001', stream = false, apiKey }) {
    const client = getClient(apiKey);

    if (stream) {
        return client.messages.stream({
            model,
            max_tokens: 2048,
            system,
            messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        });
    }

    const result = await client.messages.create({
        model,
        max_tokens: 2048,
        system,
        messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    });

    return {
        text: result.content[0].text,
        usage: {
            inputTokens: result.usage.input_tokens,
            outputTokens: result.usage.output_tokens,
            totalTokens: result.usage.input_tokens + result.usage.output_tokens,
        },
    };
}

async function explain({ cell, context, model = 'claude-haiku-4-5-20251001', apiKey }) {
    const client = getClient(apiKey);
    const prompt = `You are a finance tutor. Given a single cell from a financial model, return a JSON object with four short sections explaining it.

Input:
${JSON.stringify({ cell, context }, null, 2)}

Output strict JSON only, no markdown fences, no preamble:
{
  "what_it_is": "<1 sentence — plain English definition>",
  "how_it_was_calculated": "<1-2 sentences with the actual numbers from this model>",
  "why_it_matters": "<1-2 sentences on what this tells the analyst>",
  "textbook_reference": "<author, title edition, chapter or page>"
}

Keep each field under 200 characters. Use ₹ and crore for INR.`;

    const result = await client.messages.create({
        model,
        max_tokens: 1024,
        system: 'Return strict JSON only. No markdown fences.',
        messages: [{ role: 'user', content: prompt }],
    });

    const text = result.content[0].text;
    const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));

    return {
        json,
        usage: {
            inputTokens: result.usage.input_tokens,
            outputTokens: result.usage.output_tokens,
            totalTokens: result.usage.input_tokens + result.usage.output_tokens,
        },
    };
}

module.exports = { extract, chat, explain };
