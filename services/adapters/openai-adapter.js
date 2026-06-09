/**
 * OpenAI Adapter for dsFinancial AI Provider (BYOK only)
 */

const OpenAI = require('openai');

function getClient(apiKey) {
    if (!apiKey) throw new Error('OpenAI API key required for BYOK');
    return new OpenAI({ apiKey });
}

async function extract({ pdfBuffer, prompt, model = 'gpt-4o', apiKey }) {
    const client = getClient(apiKey);
    const result = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [
            { role: 'system', content: 'You are a financial data extraction engine. Return STRICT JSON only. No preamble. No markdown fences.' },
            {
                role: 'user',
                content: [
                    { type: 'file', file: { data: pdfBuffer.toString('base64'), filename: 'report.pdf' } },
                    { type: 'text', text: prompt },
                ],
            },
        ],
    });

    const text = result.choices[0].message.content;
    const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));

    return {
        json,
        usage: {
            inputTokens: result.usage.prompt_tokens,
            outputTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
        },
    };
}

async function chat({ messages, system, model = 'gpt-4o-mini', stream = false, apiKey }) {
    const client = getClient(apiKey);
    const openaiMessages = [{ role: 'system', content: system }];
    messages.forEach((m) => openaiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    if (stream) {
        return client.chat.completions.create({ model, messages: openaiMessages, stream: true });
    }

    const result = await client.chat.completions.create({ model, messages: openaiMessages });
    return {
        text: result.choices[0].message.content,
        usage: {
            inputTokens: result.usage.prompt_tokens,
            outputTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
        },
    };
}

async function explain({ cell, context, model = 'gpt-4o-mini', apiKey }) {
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

    const result = await client.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: 'Return strict JSON only. No markdown fences.' },
            { role: 'user', content: prompt },
        ],
    });

    const text = result.choices[0].message.content;
    const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));

    return {
        json,
        usage: {
            inputTokens: result.usage.prompt_tokens,
            outputTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
        },
    };
}

module.exports = { extract, chat, explain };
