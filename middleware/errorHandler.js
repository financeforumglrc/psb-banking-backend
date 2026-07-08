/**
 * Global Error Handler Middleware
 */

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
            error: err.message || 'Database validation error',
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
    res.status(statusCode).json({
        success: false,
        error: err.message || 'Server Error',
        code: err.code || 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = { errorHandler };
