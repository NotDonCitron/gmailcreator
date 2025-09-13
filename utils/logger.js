const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs-extra');

class Logger {
    constructor() {
        this.logDir = './logs';
        this.logger = null;
        this.initializeLogger();
    }

    initializeLogger() {
        // Ensure log directory exists
        try {
            fs.ensureDirSync(this.logDir);
        } catch (err) {
            console.error('Failed to create log directory:', err);
        }

        // Define custom formats
        const customFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                let logMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;

                // Add metadata if present
                if (Object.keys(meta).length > 0) {
                    logMessage += ` ${JSON.stringify(meta)}`;
                }

                // Add stack trace for errors
                if (stack) {
                    logMessage += `\\n${stack}`;
                }

                return logMessage;
            })
        );

        // Console format with colors
        const consoleFormat = winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({
                format: 'HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, level, message }) => {
                return `${timestamp} ${level}: ${message}`;
            })
        );

        // Create transports
        const transports = [];

        // Console transport (if enabled)
        if (process.env.LOG_TO_CONSOLE !== 'false') {
            transports.push(
                new winston.transports.Console({
                    level: process.env.LOG_LEVEL || 'info',
                    format: consoleFormat
                })
            );
        }

        // File transports (if enabled)
        if (process.env.LOG_TO_FILE !== 'false') {
            // Combined logs
            transports.push(
                new DailyRotateFile({
                    filename: path.join(this.logDir, 'combined-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'debug',
                    format: customFormat,
                    maxSize: process.env.LOG_ROTATION_SIZE || '10m',
                    maxFiles: process.env.LOG_RETENTION_DAYS || '30d',
                    zippedArchive: true
                })
            );

            // Application logs
            transports.push(
                new DailyRotateFile({
                    filename: path.join(this.logDir, 'app-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'info',
                    format: customFormat,
                    maxSize: '10m',
                    maxFiles: '30d',
                    zippedArchive: true
                })
            );

            // Error logs
            transports.push(
                new DailyRotateFile({
                    filename: path.join(this.logDir, 'error-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'error',
                    format: customFormat,
                    maxSize: '10m',
                    maxFiles: '60d',
                    zippedArchive: true
                })
            );

            // Registration success logs
            transports.push(
                new DailyRotateFile({
                    filename: path.join(this.logDir, 'registrations-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'info',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json()
                    ),
                    maxSize: '50m',
                    maxFiles: '90d',
                    zippedArchive: true
                })
            );

            // Debug logs (only in debug mode)
            if (process.env.DEBUG_MODE === 'true' || process.env.LOG_LEVEL === 'debug') {
                transports.push(
                    new DailyRotateFile({
                        filename: path.join(this.logDir, 'debug-%DATE%.log'),
                        datePattern: 'YYYY-MM-DD',
                        level: 'debug',
                        format: customFormat,
                        maxSize: '20m',
                        maxFiles: '7d',
                        zippedArchive: true
                    })
                );
            }
        }

        // Create the logger instance
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            transports: transports,
            exitOnError: false
        });

        // Handle uncaught exceptions and rejections
        this.logger.exceptions.handle(
            new winston.transports.File({
                filename: path.join(this.logDir, 'exceptions.log'),
                maxsize: 5242880, // 5MB
                maxFiles: 5
            })
        );

        this.logger.rejections.handle(
            new winston.transports.File({
                filename: path.join(this.logDir, 'rejections.log'),
                maxsize: 5242880, // 5MB
                maxFiles: 5
            })
        );

        // Add event listeners for file rotation
        transports.forEach(transport => {
            if (transport instanceof DailyRotateFile) {
                transport.on('rotate', (oldFilename, newFilename) => {
                    this.logger.info(`Log file rotated: ${oldFilename} -> ${newFilename}`);
                });

                transport.on('archive', (zipFilename) => {
                    this.logger.info(`Log file archived: ${zipFilename}`);
                });
            }
        });

        // Log initialization
        this.logger.info('🔧 Logger initialized successfully');
        this.logger.debug('Log directory:', this.logDir);
        this.logger.debug('Log level:', process.env.LOG_LEVEL || 'info');
        this.logger.debug('Console logging:', process.env.LOG_TO_CONSOLE !== 'false');
        this.logger.debug('File logging:', process.env.LOG_TO_FILE !== 'false');
    }

    // Convenience methods
    debug(message, meta = {}) {
        if (this.logger) {
            this.logger.debug(message, meta);
        } else {
            console.debug(`[DEBUG] ${message}`, meta);
        }
    }

    info(message, meta = {}) {
        if (this.logger) {
            this.logger.info(message, meta);
        } else {
            console.info(`[INFO] ${message}`, meta);
        }
    }

    warn(message, meta = {}) {
        if (this.logger) {
            this.logger.warn(message, meta);
        } else {
            console.warn(`[WARN] ${message}`, meta);
        }
    }

    error(message, error = null, meta = {}) {
        if (this.logger) {
            if (error instanceof Error) {
                this.logger.error(message, { ...meta, error: error.message, stack: error.stack });
            } else if (typeof error === 'object' && error !== null) {
                this.logger.error(message, { ...meta, ...error });
            } else if (error) {
                this.logger.error(message, { ...meta, error });
            } else {
                this.logger.error(message, meta);
            }
        } else {
            console.error(`[ERROR] ${message}`, error, meta);
        }
    }

    // Special logging methods for automation events
    registrationStart(registrationId, userData = {}) {
        this.info('REGISTRATION_START', {
            event: 'registration_start',
            registrationId,
            userData: this.sanitizeUserData(userData),
            timestamp: new Date().toISOString()
        });
    }

    registrationSuccess(registrationId, data = {}) {
        this.info('REGISTRATION_SUCCESS', {
            event: 'registration_success',
            registrationId,
            data: this.sanitizeAccountData(data),
            timestamp: new Date().toISOString()
        });
    }

    registrationFailure(registrationId, error, userData = {}) {
        this.error('REGISTRATION_FAILURE', {
            event: 'registration_failure',
            registrationId,
            error: error.message || error,
            userData: this.sanitizeUserData(userData),
            timestamp: new Date().toISOString()
        });
    }

    proxyRotation(oldProxy, newProxy) {
        this.info('PROXY_ROTATION', {
            event: 'proxy_rotation',
            oldSession: oldProxy?.sessionId || 'unknown',
            newSession: newProxy?.sessionId || 'unknown',
            timestamp: new Date().toISOString()
        });
    }

    captchaSolved(type, siteKey, solveTime) {
        this.info('CAPTCHA_SOLVED', {
            event: 'captcha_solved',
            type,
            siteKey: siteKey ? siteKey.substring(0, 20) + '...' : 'unknown',
            solveTime,
            timestamp: new Date().toISOString()
        });
    }

    browserLaunched(profileId = null) {
        this.info('BROWSER_LAUNCHED', {
            event: 'browser_launched',
            profileId,
            timestamp: new Date().toISOString()
        });
    }

    browserClosed(profileId = null) {
        this.info('BROWSER_CLOSED', {
            event: 'browser_closed',
            profileId,
            timestamp: new Date().toISOString()
        });
    }

    // Performance monitoring
    performance(action, duration, metadata = {}) {
        this.info('PERFORMANCE', {
            event: 'performance',
            action,
            duration,
            ...metadata,
            timestamp: new Date().toISOString()
        });
    }

    // Memory usage logging
    memoryUsage(label = 'Memory Usage') {
        const usage = process.memoryUsage();
        this.debug(label, {
            rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
            external: `${Math.round(usage.external / 1024 / 1024)} MB`
        });
    }

    // Statistics logging
    stats(stats) {
        this.info('AUTOMATION_STATS', {
            event: 'stats',
            ...stats,
            timestamp: new Date().toISOString()
        });
    }

    // Sanitize sensitive user data for logging
    sanitizeUserData(userData) {
        if (!userData || typeof userData !== 'object') {
            return userData;
        }

        const sanitized = { ...userData };

        // Remove or mask sensitive fields
        if (sanitized.password) {
            sanitized.password = '[HIDDEN]';
        }

        if (sanitized.phoneNumber) {
            const phone = sanitized.phoneNumber.toString();
            sanitized.phoneNumber = phone.length > 6 ?
                phone.substring(0, 3) + '***' + phone.substring(phone.length - 3) :
                '[HIDDEN]';
        }

        if (sanitized.email) {
            const [local, domain] = sanitized.email.split('@');
            if (local && domain) {
                const maskedLocal = local.length > 3 ?
                    local.substring(0, 2) + '***' + local.substring(local.length - 1) :
                    '***';
                sanitized.email = `${maskedLocal}@${domain}`;
            }
        }

        return sanitized;
    }

    // Sanitize sensitive account data for logging
    sanitizeAccountData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const sanitized = { ...data };

        // Mask API keys
        if (sanitized.apiKey) {
            sanitized.apiKey = sanitized.apiKey.length > 10 ?
                sanitized.apiKey.substring(0, 10) + '...' :
                '[HIDDEN]';
        }

        // Mask passwords
        if (sanitized.password) {
            sanitized.password = '[HIDDEN]';
        }

        return sanitized;
    }

    // Create child logger with specific context
    child(context) {
        return {
            debug: (message, meta = {}) => this.debug(message, { ...meta, context }),
            info: (message, meta = {}) => this.info(message, { ...meta, context }),
            warn: (message, meta = {}) => this.warn(message, { ...meta, context }),
            error: (message, error = null, meta = {}) => this.error(message, error, { ...meta, context })
        };
    }

    // Flush all logs (useful for testing)
    async flush() {
        if (!this.logger) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const transports = this.logger.transports;
            let pending = transports.length;

            if (pending === 0) {
                resolve();
                return;
            }

            transports.forEach(transport => {
                if (typeof transport.close === 'function') {
                    transport.close(() => {
                        pending--;
                        if (pending === 0) resolve();
                    });
                } else {
                    pending--;
                    if (pending === 0) resolve();
                }
            });
        });
    }

    // Get current log level
    getLevel() {
        return this.logger ? this.logger.level : 'info';
    }

    // Set log level dynamically
    setLevel(level) {
        if (this.logger) {
            this.logger.level = level;
            this.logger.transports.forEach(transport => {
                transport.level = level;
            });
            this.info(`Log level changed to: ${level}`);
        }
    }
}

// Create singleton instance
const loggerInstance = new Logger();

// Export the logger methods directly for convenience
module.exports = {
    debug: loggerInstance.debug.bind(loggerInstance),
    info: loggerInstance.info.bind(loggerInstance),
    warn: loggerInstance.warn.bind(loggerInstance),
    error: loggerInstance.error.bind(loggerInstance),
    registrationStart: loggerInstance.registrationStart.bind(loggerInstance),
    registrationSuccess: loggerInstance.registrationSuccess.bind(loggerInstance),
    registrationFailure: loggerInstance.registrationFailure.bind(loggerInstance),
    proxyRotation: loggerInstance.proxyRotation.bind(loggerInstance),
    captchaSolved: loggerInstance.captchaSolved.bind(loggerInstance),
    browserLaunched: loggerInstance.browserLaunched.bind(loggerInstance),
    browserClosed: loggerInstance.browserClosed.bind(loggerInstance),
    performance: loggerInstance.performance.bind(loggerInstance),
    memoryUsage: loggerInstance.memoryUsage.bind(loggerInstance),
    stats: loggerInstance.stats.bind(loggerInstance),
    child: loggerInstance.child.bind(loggerInstance),
    flush: loggerInstance.flush.bind(loggerInstance),
    getLevel: loggerInstance.getLevel.bind(loggerInstance),
    setLevel: loggerInstance.setLevel.bind(loggerInstance),

    // Export the winston logger instance for advanced usage
    logger: loggerInstance.logger
};