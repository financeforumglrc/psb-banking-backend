/**
 * AI API Tests
 * Testing Patent PAT-007: Multi-Provider AI Orchestrator
 */

process.env.JWT_SECRET = 'testsecret';
process.env.GROQ_API_KEY = 'test_key';
process.env.OPENAI_API_KEY = 'test_key';
process.env.ANTHROPIC_API_KEY = 'test_key';

const request = require('supertest');
const app = require('../server');
const axios = require('axios');

jest.mock('axios');

describe('AI API Tests', () => {
    let authToken;

    beforeAll(async () => {
        // Create user
        await request(app)
            .post('/api/v1/auth/register')
            .send({
                email: 'test-ai@dsfinancial.in',
                password: 'TestPass123!',
                name: 'AI Test User'
            });

        // Login
        const login = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'test-ai@dsfinancial.in',
                password: 'TestPass123!'
            });

        authToken = login.body.data.tokens.accessToken;
    });

    describe('PAT-007: Multi-Provider AI Orchestrator', () => {
        test('should process AI tax query', async () => {
            axios.post.mockResolvedValue({
                data: {
                    choices: [{ message: { content: 'Mocked AI Response' } }],
                    usage: { total_tokens: 100 }
                }
            });
            const res = await request(app)
                .post('/api/v1/ai/ask')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    question: 'What is the current GST rate for software development services in India?',
                    context: 'IT Services sector'
                });

            // Depending on whether we have mocked the AI responses or have actual API keys:
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.answer).toBeDefined();
            // Verify our patent feature
            expect(res.body.data.provider).toBeDefined();
        });
        
        test('should handle validation errors', async () => {
            const res = await request(app)
                .post('/api/v1/ai/ask')
                .set('Authorization', `Bearer ${authToken}`)
                .send({}); // Missing question

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('QUESTION_MISSING');
        });

        test('should generate Rakshak intervention for high-risk transaction', async () => {
            const res = await request(app)
                .post('/api/v1/ai/rakshak-intervention')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    riskScore: 85,
                    signals: ['New device', 'High amount', 'Unusual payee'],
                    amount: 200000,
                    beneficiaryName: 'Unknown Merchant'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.message).toBeDefined();
            expect(res.body.data.message.length).toBeGreaterThan(0);
            expect(Array.isArray(res.body.data.quickReplies)).toBe(true);
            expect(res.body.data.quickReplies.length).toBe(3);
            expect(['urgent', 'critical']).toContain(res.body.data.tone);
        });

        test('should reject invalid riskScore for Rakshak intervention', async () => {
            const res = await request(app)
                .post('/api/v1/ai/rakshak-intervention')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ riskScore: 'high' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });
});
