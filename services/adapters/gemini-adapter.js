/**
 * Gemini Adapter for dsFinancial AI Provider
 * Uses @google/generative-ai SDK
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

function getClient(apiKey) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    return new GoogleGenerativeAI(key);
}

const MOCK_MODE = process.env.AI_MOCK_MODE === 'true' || !process.env.GEMINI_API_KEY;

function mockResponse(type, input) {
    if (type === 'chat') {
        const msg = input?.messages?.[input.messages.length - 1]?.content || '';
        if (msg.includes('OK')) return { text: 'OK', usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } };
        return { text: 'This is a demo response. Add GEMINI_API_KEY to .env for real AI answers.', usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 } };
    }
    if (type === 'explain') {
        return {
            json: {
                what_it_is: `${input?.cell?.label || 'This cell'} represents the free cash flow available to all investors after operating expenses and taxes.`,
                how_it_was_calculated: `Computed as EBIT*(1-tax rate) + D&A - CapEx - ΔWorking Capital using the model inputs.`,
                why_it_matters: `FCFF is the core input to DCF valuation. Positive and growing FCFF indicates value creation.`,
                textbook_reference: 'Damodaran, Investment Valuation, 4th ed., Ch. 12'
            },
            usage: { inputTokens: 50, outputTokens: 40, totalTokens: 90 }
        };
    }
    if (type === 'extract') {
        return {
            json: {
                company: { name: 'Demo Company', ticker: 'DEMO', currency: 'INR', fiscal_year_end: 'March 31', accounting_standard: 'IND_AS' },
                income_statement: { FY24: [{ label: 'Revenue', value: 100000 }, { label: 'EBITDA', value: 20000 }, { label: 'PAT', value: 15000 }] },
                balance_sheet: { FY24: [{ label: 'Total Assets', value: 200000 }, { label: 'Total Equity', value: 120000 }] },
                cash_flow: { FY24: [{ label: 'Operating Cash Flow', value: 18000 }, { label: 'Free Cash Flow', value: 12000 }] }
            },
            usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 }
        };
    }
    return { text: 'Mock AI response', usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } };
}

async function extract({ pdfBuffer, prompt, model = 'gemini-2.5-flash', apiKey }) {
    if (MOCK_MODE) return mockResponse('extract', { pdfBuffer, prompt });
    const genAI = getClient(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });

    let result;
    try {
        result = await generativeModel.generateContent([
            { inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } },
            prompt,
        ]);
    } catch (err) {
        if (err.message && err.message.includes('does not support image input')) {
            throw new Error('This AI model only supports PDF files. Please upload a valid PDF document.');
        }
        throw err;
    }

    const text = result.response.text();
    const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
    const usage = result.response.usageMetadata || {};

    return {
        json,
        usage: {
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
            totalTokens: usage.totalTokenCount || 0,
        },
    };
}

async function chat({ messages, system, model = 'gemini-2.5-flash-lite', stream = false, apiKey }) {
    if (MOCK_MODE && !stream) return mockResponse('chat', { messages, system });
    const genAI = getClient(apiKey);
    const generativeModel = genAI.getGenerativeModel({
        model,
        systemInstruction: system,
    });

    const history = messages.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));

    const chatSession = generativeModel.startChat({ history });
    const lastMessage = messages[messages.length - 1]?.content || '';

    if (stream) {
        return chatSession.sendMessageStream(lastMessage);
    }

    const result = await chatSession.sendMessage(lastMessage);
    const usage = result.response.usageMetadata || {};

    return {
        text: result.response.text(),
        usage: {
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
            totalTokens: usage.totalTokenCount || 0,
        },
    };
}

async function explain({ cell, context, model = 'gemini-2.5-flash-lite', apiKey }) {
    if (MOCK_MODE) return mockResponse('explain', { cell, context });
    const genAI = getClient(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });

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

    const result = await generativeModel.generateContent(prompt);
    const text = result.response.text();
    const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
    const usage = result.response.usageMetadata || {};

    return {
        json,
        usage: {
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
            totalTokens: usage.totalTokenCount || 0,
        },
    };
}

module.exports = { extract, chat, explain };
