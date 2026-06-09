/**
 * Swagger/OpenAPI Configuration
 * API Documentation
 * NOTE: Requires 'swagger-jsdoc' to be installed.
 */

let swaggerJsdoc;
try {
    swaggerJsdoc = require('swagger-jsdoc');
} catch (e) {
    console.warn('swagger-jsdoc not installed. Swagger documentation is disabled.');
}

if (!swaggerJsdoc) {
    module.exports = null;
} else {

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'DS Financial API',
            version: '2.0.0',
            description: 'Patent-Protected Financial API Platform',
            contact: {
                name: 'DS Financial Solutions',
                email: 'api@dsfinancial.in',
                url: 'https://dsfinancial.in'
            },
            license: {
                name: 'Proprietary',
                url: 'https://dsfinancial.in/license'
            }
        },
        servers: [
            {
                url: 'http://localhost:5000/api/v1',
                description: 'Development server'
            },
            {
                url: 'https://api.dsfinancial.in/api/v1',
                description: 'Production server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                },
                apiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key'
                }
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string' },
                        role: { type: 'string', enum: ['user', 'premium', 'enterprise', 'admin'] },
                        tier: { type: 'string', enum: ['free', 'basic', 'premium', 'enterprise'] }
                    }
                },
                GSTINValidation: {
                    type: 'object',
                    properties: {
                        isValid: { type: 'boolean' },
                        riskScore: { type: 'number' },
                        riskLevel: { type: 'string', enum: ['safe', 'low-risk', 'medium-risk', 'high-risk', 'critical'] },
                        state: { type: 'object' },
                        entityType: { type: 'string' },
                        registrationType: { type: 'object' }
                    }
                },
                TaxCalculation: {
                    type: 'object',
                    properties: {
                        oldRegime: { type: 'object' },
                        newRegime: { type: 'object' },
                        optimal: { type: 'object' },
                        recommendations: { type: 'array' },
                        potentialSavings: { type: 'number' }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string' },
                        code: { type: 'string' }
                    }
                }
            }
        },
        tags: [
            { name: 'Authentication', description: 'User authentication endpoints' },
            { name: 'GST', description: 'GST compliance and validation (Patents PAT-001 to PAT-006)' },
            { name: 'Tax', description: 'Income tax calculation and optimization (Patent PAT-004)' },
            { name: 'AI', description: 'AI-powered advisory (Patent PAT-007)' },
            { name: 'Documents', description: 'Document generation' },
            { name: 'Analytics', description: 'Usage analytics and reporting' }
        ]
    },
    apis: ['./routes/*.js']
};

    module.exports = swaggerJsdoc(options);
}
