const logger = require('./logger');
const settings = require('../config/settings');

class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.lastErrors = new Map();
        this.recoveryStrategies = new Map();
        this.maxConsecutiveFailures = settings.errorHandling.maxConsecutiveFailures;
        this.failureThreshold = settings.errorHandling.failureThreshold;
        this.recoveryDelay = settings.errorHandling.recoveryDelay;

        this.initializeStrategies();
        logger.info('🛡️  Error handler initialized');
    }

    initializeStrategies() {
        // Define recovery strategies for different error types
        this.recoveryStrategies.set('NETWORK_ERROR', [
            'retry',
            'rotate_proxy',
            'pause_automation'
        ]);

        this.recoveryStrategies.set('CAPTCHA_ERROR', [
            'retry',
            'wait_longer',
            'skip_captcha'
        ]);

        this.recoveryStrategies.set('GOOGLE_OAUTH_ERROR', [
            'retry',
            'clear_cookies',
            'rotate_proxy',
            'restart_browser'
        ]);

        this.recoveryStrategies.set('KILOCODE_ERROR', [
            'retry',
            'wait_longer',
            'rotate_proxy'
        ]);

        this.recoveryStrategies.set('BROWSER_ERROR', [
            'restart_browser',
            'rotate_proxy',
            'pause_automation'
        ]);

        this.recoveryStrategies.set('PROXY_ERROR', [
            'rotate_proxy',
            'test_proxy',
            'pause_automation'
        ]);

        this.recoveryStrategies.set('RATE_LIMIT_ERROR', [
            'wait_longer',
            'rotate_proxy',
            'pause_automation'
        ]);

        this.recoveryStrategies.set('DOLPHIN_ANTY_ERROR', [
            'retry',
            'cleanup_profiles',
            'restart_browser'
        ]);

        this.recoveryStrategies.set('GENERIC_ERROR', [
            'retry',
            'wait_longer',
            'rotate_proxy'
        ]);
    }

    async handleError(error, context = null) {
        const errorType = this.classifyError(error);
        const errorKey = `${errorType}_${context || 'global'}`;

        // Track error occurrence
        this.trackError(errorKey, error);

        logger.error(`🚨 Handling ${errorType} error${context ? ` in ${context}` : ''}:`, error);

        // Get recovery strategy
        const strategies = this.recoveryStrategies.get(errorType) ||
                          this.recoveryStrategies.get('GENERIC_ERROR');

        // Execute recovery strategies
        const recoveryResult = await this.executeRecoveryStrategy(strategies, error, context);

        // Log recovery attempt
        logger.info(`🔧 Recovery strategy for ${errorType}: ${recoveryResult.strategy} - ${recoveryResult.success ? 'SUCCESS' : 'FAILED'}`);

        return {
            errorType,
            shouldRetry: recoveryResult.shouldRetry,
            recoveryStrategy: recoveryResult.strategy,
            recoverySuccess: recoveryResult.success,
            delay: recoveryResult.delay || 0
        };
    }

    classifyError(error) {
        const message = error.message?.toLowerCase() || '';
        const stack = error.stack?.toLowerCase() || '';
        const errorText = `${message} ${stack}`;

        // Network related errors
        if (errorText.includes('network') ||
            errorText.includes('timeout') ||
            errorText.includes('connection') ||
            errorText.includes('econnrefused') ||
            errorText.includes('enotfound') ||
            errorText.includes('socket hang up')) {
            return 'NETWORK_ERROR';
        }

        // Captcha related errors
        if (errorText.includes('captcha') ||
            errorText.includes('recaptcha') ||
            errorText.includes('hcaptcha')) {
            return 'CAPTCHA_ERROR';
        }

        // Google OAuth errors
        if (errorText.includes('oauth') ||
            errorText.includes('google') ||
            errorText.includes('accounts.google.com') ||
            errorText.includes('authentication failed')) {
            return 'GOOGLE_OAUTH_ERROR';
        }

        // Kilocode platform errors
        if (errorText.includes('kilocode') ||
            errorText.includes('registration failed')) {
            return 'KILOCODE_ERROR';
        }

        // Browser related errors
        if (errorText.includes('browser') ||
            errorText.includes('puppeteer') ||
            errorText.includes('page closed') ||
            errorText.includes('execution context') ||
            errorText.includes('target closed')) {
            return 'BROWSER_ERROR';
        }

        // Proxy related errors
        if (errorText.includes('proxy') ||
            errorText.includes('tunnel') ||
            errorText.includes('407') || // Proxy Authentication Required
            message.includes('proxy')) {
            return 'PROXY_ERROR';
        }

        // Rate limiting errors
        if (errorText.includes('rate limit') ||
            errorText.includes('too many requests') ||
            errorText.includes('429') ||
            errorText.includes('quota exceeded')) {
            return 'RATE_LIMIT_ERROR';
        }

        // Dolphin Anty errors
        if (errorText.includes('dolphin') ||
            errorText.includes('profile') ||
            errorText.includes('browser profile')) {
            return 'DOLPHIN_ANTY_ERROR';
        }

        return 'GENERIC_ERROR';
    }

    async executeRecoveryStrategy(strategies, error, context) {
        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];

            try {
                logger.debug(`🔧 Attempting recovery strategy: ${strategy}`);

                const result = await this.applyStrategy(strategy, error, context);

                if (result.success) {
                    return {
                        strategy,
                        success: true,
                        shouldRetry: result.shouldRetry,
                        delay: result.delay
                    };
                }

                // If not the last strategy, continue to next one
                if (i < strategies.length - 1) {
                    logger.debug(`Strategy ${strategy} failed, trying next strategy...`);
                    continue;
                }

            } catch (strategyError) {
                logger.warn(`Recovery strategy ${strategy} threw error:`, strategyError.message);
                continue;
            }
        }

        // All strategies failed
        return {
            strategy: 'all_failed',
            success: false,
            shouldRetry: false,
            delay: 0
        };
    }

    async applyStrategy(strategy, error, context) {
        const ProxyManager = require('../config/proxies');

        switch (strategy) {
            case 'retry':
                return {
                    success: true,
                    shouldRetry: true,
                    delay: this.calculateRetryDelay(context)
                };

            case 'wait_longer':
                return {
                    success: true,
                    shouldRetry: true,
                    delay: Math.min(this.recoveryDelay * 2, 180000) // Max 3 minutes
                };

            case 'rotate_proxy':
                try {
                    const proxyManager = new ProxyManager();
                    const newProxy = await proxyManager.getWorkingProxy();
                    logger.info(`🔄 Proxy rotated to session ${newProxy.sessionId}`);
                    return {
                        success: true,
                        shouldRetry: true,
                        delay: 5000
                    };
                } catch (proxyError) {
                    logger.error('Proxy rotation failed:', proxyError.message);
                    return { success: false };
                }

            case 'restart_browser':
                // This would need to be handled by the calling code
                logger.info('🔄 Browser restart recommended');
                return {
                    success: true,
                    shouldRetry: true,
                    delay: 10000
                };

            case 'clear_cookies':
                logger.info('🍪 Cookie clearing recommended');
                return {
                    success: true,
                    shouldRetry: true,
                    delay: 5000
                };

            case 'pause_automation':
                const pauseDuration = Math.min(this.recoveryDelay * 3, 300000); // Max 5 minutes
                logger.info(`⏸️  Pausing automation for ${pauseDuration / 1000}s`);
                return {
                    success: true,
                    shouldRetry: true,
                    delay: pauseDuration
                };

            case 'skip_captcha':
                logger.info('🤖 Skipping captcha solving');
                return {
                    success: true,
                    shouldRetry: true,
                    delay: 2000
                };

            case 'test_proxy':
                try {
                    const proxyManager = new ProxyManager();
                    const testResult = await proxyManager.testProxyConnection();
                    if (testResult.success) {
                        logger.info('✅ Proxy test successful');
                        return {
                            success: true,
                            shouldRetry: true,
                            delay: 2000
                        };
                    } else {
                        throw new Error('Proxy test failed');
                    }
                } catch (testError) {
                    logger.error('Proxy test failed:', testError.message);
                    return { success: false };
                }

            case 'cleanup_profiles':
                logger.info('🧹 Profile cleanup recommended');
                return {
                    success: true,
                    shouldRetry: true,
                    delay: 10000
                };

            default:
                logger.warn(`Unknown recovery strategy: ${strategy}`);
                return { success: false };
        }
    }

    trackError(errorKey, error) {
        // Initialize tracking for this error key if needed
        if (!this.errorCounts.has(errorKey)) {
            this.errorCounts.set(errorKey, {
                count: 0,
                firstOccurrence: Date.now(),
                lastOccurrence: Date.now()
            });
        }

        // Update error tracking
        const errorInfo = this.errorCounts.get(errorKey);
        errorInfo.count++;
        errorInfo.lastOccurrence = Date.now();

        // Store the last error
        this.lastErrors.set(errorKey, {
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
        });

        // Check if we've exceeded failure thresholds
        this.checkFailureThresholds(errorKey);
    }

    checkFailureThresholds(errorKey) {
        const errorInfo = this.errorCounts.get(errorKey);

        if (!errorInfo) return;

        // Check consecutive failures
        if (errorInfo.count >= this.maxConsecutiveFailures) {
            logger.warn(`⚠️  Maximum consecutive failures reached for ${errorKey}: ${errorInfo.count}`);
            this.triggerFailureAlert(errorKey, errorInfo);
        }

        // Check failure rate (failures in last hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const recentFailures = Array.from(this.errorCounts.values())
            .filter(info => info.lastOccurrence > oneHourAgo)
            .reduce((sum, info) => sum + info.count, 0);

        const totalAttempts = recentFailures; // Simplified - would need total attempt tracking
        const failureRate = totalAttempts > 0 ? recentFailures / totalAttempts : 0;

        if (failureRate > this.failureThreshold) {
            logger.warn(`⚠️  High failure rate detected: ${(failureRate * 100).toFixed(1)}%`);
        }
    }

    triggerFailureAlert(errorKey, errorInfo) {
        const alert = {
            type: 'HIGH_FAILURE_RATE',
            errorKey,
            errorCount: errorInfo.count,
            duration: Date.now() - errorInfo.firstOccurrence,
            lastError: this.lastErrors.get(errorKey),
            timestamp: new Date().toISOString()
        };

        logger.error('🚨 FAILURE ALERT', alert);

        // Could send to external monitoring system here
        this.sendAlert(alert);
    }

    sendAlert(alert) {
        // Placeholder for external alert system integration
        // Could send to Slack, Discord, email, etc.
        logger.info('📧 Alert would be sent to monitoring system:', alert.type);
    }

    calculateRetryDelay(context = null) {
        // Base delay with some randomness
        const baseDelay = this.recoveryDelay;
        const jitter = Math.random() * 2000; // 0-2 seconds of jitter

        // Add context-specific delays
        let contextMultiplier = 1;
        if (context?.includes('google')) contextMultiplier = 1.5;
        if (context?.includes('captcha')) contextMultiplier = 2;
        if (context?.includes('kilocode')) contextMultiplier = 1.2;

        return Math.min(baseDelay * contextMultiplier + jitter, 120000); // Max 2 minutes
    }

    getErrorStats() {
        const stats = {
            totalErrors: 0,
            errorTypes: {},
            topErrors: [],
            recentErrors: []
        };

        // Calculate total errors and breakdown by type
        this.errorCounts.forEach((info, key) => {
            stats.totalErrors += info.count;

            const [errorType] = key.split('_');
            stats.errorTypes[errorType] = (stats.errorTypes[errorType] || 0) + info.count;
        });

        // Get top errors by frequency
        stats.topErrors = Array.from(this.errorCounts.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([key, info]) => ({
                errorKey: key,
                count: info.count,
                firstOccurrence: new Date(info.firstOccurrence).toISOString(),
                lastOccurrence: new Date(info.lastOccurrence).toISOString()
            }));

        // Get recent errors (last hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        stats.recentErrors = Array.from(this.errorCounts.entries())
            .filter(([, info]) => info.lastOccurrence > oneHourAgo)
            .map(([key, info]) => ({
                errorKey: key,
                count: info.count,
                lastError: this.lastErrors.get(key)
            }));

        return stats;
    }

    resetErrorCounts() {
        this.errorCounts.clear();
        this.lastErrors.clear();
        logger.info('🔄 Error counts reset');
    }

    isHealthy() {
        const stats = this.getErrorStats();
        const oneHourAgo = Date.now() - (60 * 60 * 1000);

        const recentErrorCount = Array.from(this.errorCounts.values())
            .filter(info => info.lastOccurrence > oneHourAgo)
            .reduce((sum, info) => sum + info.count, 0);

        // Consider system healthy if less than 10 errors in the last hour
        return recentErrorCount < 10;
    }

    // Utility methods
    isRetryableError(error) {
        const nonRetryablePatterns = [
            'invalid credentials',
            'account suspended',
            'permission denied',
            'unauthorized',
            'forbidden',
            'payment required'
        ];

        const message = error.message?.toLowerCase() || '';
        return !nonRetryablePatterns.some(pattern => message.includes(pattern));
    }

    getRecoveryDelay() {
        return this.recoveryDelay;
    }

    setRecoveryDelay(delay) {
        this.recoveryDelay = delay;
        logger.info(`🔧 Recovery delay set to ${delay}ms`);
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

module.exports = errorHandler;