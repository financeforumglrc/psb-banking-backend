/**
 * Global Error Handler Middleware
 */

const isDev = process.env.NODE_ENV === 'development';

const safeMessage = (err) => {
    // Only expose detailed messages for known client-side errors in development
    if (isDev) return err.message || 'Server Error';
    return 'Server Error';
};

const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // SQLite unique constraint error
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({
            success: false,
            error: 'Duplicate field value entered',
            code: 'DUPLICATE_ERROR'
        });
    }

    // SQLite foreign key constraint error
    if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
        return res.status(400).json({
            success: false,
            error: 'Referenced record does not exist',
            code: 'FOREIGN_KEY_ERROR'
        });
    }

    // SQLite validation/type errors
    if (err.name === 'SqliteError' || err.name === 'TypeError') {
        return res.status(400).json({
            success: false,
            error: isDev ? err.message : 'Database validation error',
            code: 'VALIDATION_ERROR'
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'TOKEN_INVALID'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED'
        });
    }

    // Default error
    const statusCode = err.statusCode || (err.status >= 100 && err.status < 600 ? err.status : 500) || 500;
    const response = {
        success: false,
        error: safeMessage(err),
        code: err.code || 'INTERNAL_ERROR'
    };

    if (isDev) {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

module.exports = { errorHandler };
