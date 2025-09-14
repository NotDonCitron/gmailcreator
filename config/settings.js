module.exports = {
    // Application settings
    app: {
        name: 'Kilocode Automation',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'production'
    },

    // Browser automation settings
    browser: {
        headless: process.env.BROWSER_HEADLESS === 'true',
        timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
        navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT) || 30000,
        slowMo: parseInt(process.env.SLOW_MO) || 100,
        viewport: {
            width: parseInt(process.env.BROWSER_VIEWPORT_WIDTH) || 1366,
            height: parseInt(process.env.BROWSER_VIEWPORT_HEIGHT) || 768
        },
        userDataDir: process.env.USER_DATA_DIR || './temp/profiles',

        // Browser launch arguments
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-field-trial-config',
            '--disable-back-forward-cache',
            '--disable-ipc-flooding-protection'
        ]
    },

    // Automation timing and retry settings
    automation: {
        maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
        retryBaseDelay: 5000,
        retryMaxDelay: 60000,
        concurrentInstances: parseInt(process.env.CONCURRENT_INSTANCES) || 1,
        batchSize: parseInt(process.env.REGISTRATION_BATCH_SIZE) || 10,
        delayBetweenRegistrations: parseInt(process.env.DELAY_BETWEEN_REGISTRATIONS) || 30000,
        cooldownBetweenBatches: parseInt(process.env.COOLDOWN_BETWEEN_BATCHES) || 300000,

        // Human-like behavior settings
        humanDelays: {
            typing: {
                min: 50,
                max: 200
            },
            clicking: {
                min: 200,
                max: 800
            },
            navigation: {
                min: 2000,
                max: 5000
            },
            formFilling: {
                min: 500,
                max: 1500
            }
        }
    },

    // Google account creation settings
    google: {
        signupUrl: process.env.GOOGLE_SIGNUP_URL_OVERRIDE || 'https://accounts.google.com/signup/v2/webcreateaccount',
        selectorUpdateMode: process.env.GOOGLE_SELECTOR_UPDATE_MODE || 'manual', // auto | manual
        debugMode: process.env.GOOGLE_DEBUG_MODE === 'true',
        signupDelay: {
            min: parseInt(process.env.GOOGLE_SIGNUP_DELAY_MIN) || 5000,
            max: parseInt(process.env.GOOGLE_SIGNUP_DELAY_MAX) || 15000
        },
        phoneVerificationTimeout: parseInt(process.env.PHONE_VERIFICATION_TIMEOUT) || 300,
        emailVerificationTimeout: parseInt(process.env.EMAIL_VERIFICATION_TIMEOUT) || 300,

        // Account generation preferences
        preferredDomains: [
            'gmail.com',
            'outlook.com',
            'yahoo.com',
            'hotmail.com',
            'icloud.com'
        ],

        // Age range for generated accounts (years)
        ageRange: {
            min: 18,
            max: 65
        }
    },

    // Kilocode platform settings
    kilocode: {
        baseUrl: process.env.KILOCODE_BASE_URL || 'https://kilocode.com',
        loginUrl: process.env.KILOCODE_LOGIN_URL || 'https://kilocode.com/login',
        dashboardUrl: process.env.KILOCODE_DASHBOARD_URL || 'https://kilocode.com/dashboard',
        apiUrl: process.env.KILOCODE_API_URL || 'https://kilocode.com/api',
        registrationDelay: parseInt(process.env.KILOCODE_REGISTRATION_DELAY) || 10000,
        bonusCollectionTimeout: parseInt(process.env.BONUS_COLLECTION_TIMEOUT) || 60,
        oauthTimeout: 30000,

        // OAuth flow settings
        oauth: {
            timeout: 30000,
            maxRedirects: 5,
            allowedDomains: [
                'accounts.google.com',
                'kilocode.com'
            ]
        }
    },

    // Proxy configuration
    proxy: {
        enabled: !!(process.env.PROXY_HOST && process.env.PROXY_PORT),
        host: process.env.PROXY_HOST || 'x305.fxdx.in',
        port: parseInt(process.env.PROXY_PORT) || 15874,
        username: process.env.PROXY_USERNAME || 'rejuvenatedplateau131819',
        password: process.env.PROXY_PASSWORD || 'asLuOnc1EXrm',
        type: process.env.PROXY_TYPE || 'http',
        maxSessions: 10,
        rotationInterval: 300000, // 5 minutes
        healthCheckInterval: 60000, // 1 minute
        connectionTimeout: 10000
    },

    // Captcha solving configuration
    captcha: {
        enabled: !!process.env.TWOCAPTCHA_API_KEY,
        service: process.env.CAPTCHA_SERVICE || '2captcha',
        apiKey: process.env.TWOCAPTCHA_API_KEY,
        timeout: parseInt(process.env.CAPTCHA_TIMEOUT) || 120,
        pollInterval: 5000,
        maxRetries: 3,

        // Service-specific settings
        twoCaptcha: {
            baseUrl: 'http://2captcha.com',
            softId: 3792 // Default soft ID for 2captcha
        }
    },

    // SMS / Phone verification configuration
    sms: {
        // Normalize provider: Twilio is disabled by policy (fallback to mock)
        provider: (() => {
            const prov = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
            return prov === 'twilio' ? 'mock' : prov;
        })(),
        manualPhone: process.env.SMS_MANUAL_PHONE || '',
        blacklistNumbers: (process.env.SMS_BLACKLIST || '+491732114133').split(',').map(s => s.trim()).filter(Boolean),

        // Provider fallback and health checking
        providerFallbackChain: (process.env.SMS_PROVIDER_FALLBACK_CHAIN || 'mock').split(',').map(p => p.trim()),
        credentialValidationOnStartup: process.env.SMS_CREDENTIAL_VALIDATION_ON_STARTUP !== 'false',
        healthCheckInterval: parseInt(process.env.SMS_PROVIDER_HEALTH_CHECK_INTERVAL) || 300000, // 5 minutes

        // Code input configuration for mock/manual flows
        codeInput: {
            mode: process.env.SMS_CODE_INPUT_MODE || 'env', // env | file | prompt
            filePath: process.env.SMS_CODE_FILE || './temp/sms_code.txt',
            pollIntervalMs: parseInt(process.env.SMS_CODE_POLL_INTERVAL_MS) || 2000,
            clearFileAfterRead: process.env.SMS_CODE_CLEAR_FILE === 'true'
        },

        // Legacy Twilio configuration retained for compatibility but not used
        twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID || '',
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            // If TWILIO_SUBACCOUNT_SID is set, it will be used as the Account SID for API calls
            subaccountSid: process.env.TWILIO_SUBACCOUNT_SID || '',
            inboundNumber: process.env.TWILIO_INBOUND_NUMBER || '', // E.164, e.g. +14155550123
            messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
            pollIntervalMs: parseInt(process.env.TWILIO_POLL_INTERVAL_MS) || 3000,
            pollTimeoutMs: parseInt(process.env.TWILIO_POLL_TIMEOUT_MS) || ((parseInt(process.env.PHONE_VERIFICATION_TIMEOUT) || 300) * 1000),
            inboundSearchWindowMinutes: parseInt(process.env.TWILIO_INBOUND_SEARCH_WINDOW_MINUTES) || 15,
            webhookUrl: process.env.TWILIO_WEBHOOK_URL || '' // not used in polling mode
        }
    },

    // Dolphin Anty browser profile management
    dolphinAnty: {
        enabled: !!process.env.DOLPHIN_ANTY_HOST,
        host: process.env.DOLPHIN_ANTY_HOST || 'http://localhost:3001',
        token: process.env.DOLPHIN_ANTY_TOKEN,
        apiVersion: process.env.DOLPHIN_ANTY_API_VERSION || 'auto', // v1.0, v2, auto
        authHeaderType: process.env.DOLPHIN_ANTY_AUTH_HEADER_TYPE || 'auto', // bearer, x-auth-token, auto
        fallbackEnabled: process.env.DOLPHIN_ANTY_FALLBACK_ENABLED !== 'false',
        timeout: 30000,
        maxProfiles: 50, // Free version limit
        profileCleanupDelay: 5000,

        // Default profile settings
        defaultProfile: {
            browserType: 'anty',
            platform: 'windows',
            automation: {
                allowAutomation: true,
                disableWebSecurity: false
            }
        }
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        toFile: process.env.LOG_TO_FILE === 'true',
        toConsole: process.env.LOG_TO_CONSOLE !== 'false',
        directory: './logs',

        // File rotation settings
        rotation: {
            size: process.env.LOG_ROTATION_SIZE || '10MB',
            maxFiles: process.env.LOG_MAX_FILES || '30d',
            retentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30
        },

        // Log file names
        files: {
            application: 'app.log',
            registrations: 'registrations.log',
            errors: 'errors.log',
            debug: 'debug.log',
            combined: 'combined.log'
        }
    },

    // Security and stealth settings
    security: {
        // Screenshot settings
        screenshotOnError: process.env.SCREENSHOT_ON_ERROR === 'true',
        saveHtmlOnError: process.env.SAVE_HTML_ON_ERROR === 'true',
        screenshotDirectory: './temp/screenshots',

        // Data protection
        maskSensitiveData: true,
        encryptStoredData: false,

        // Anti-detection measures
        randomizeFingerprints: true,
        rotateUserAgents: true,
        varyRequestTiming: true,
        spoofCanvasFingerprint: true,
        blockWebRTC: true
    },

    // Performance settings
    performance: {
        maxConcurrentPages: 5,
        pagePoolSize: 3,
        memoryThreshold: 1024, // MB
        cpuThreshold: 80, // Percentage

        // Resource optimization
        blockResources: {
            images: true,
            stylesheets: false,
            fonts: true,
            media: false
        },

        // Garbage collection settings
        forceGC: true,
        gcInterval: 300000 // 5 minutes
    },

    // Development and debugging
    development: {
        debugMode: process.env.DEBUG_MODE === 'true',
        verboseLogging: process.env.VERBOSE_LOGGING === 'true',
        preserveUserData: process.env.PRESERVE_USER_DATA === 'true',
        mockExternalServices: process.env.MOCK_SERVICES === 'true',
        capturePageStateOnError: process.env.CAPTURE_PAGE_STATE_ON_ERROR !== 'false',
        selectorDiscoveryMode: process.env.SELECTOR_DISCOVERY_MODE === 'true',
        apiCompatibilityTesting: process.env.API_COMPATIBILITY_TESTING === 'true',

        // Testing settings
        dryRun: process.env.DRY_RUN === 'true',
        skipCaptcha: process.env.SKIP_CAPTCHA === 'true',
        skipPhoneVerification: process.env.SKIP_PHONE_VERIFICATION === 'true'
    },

    // File and directory paths
    paths: {
        root: process.cwd(),
        src: './src',
        config: './config',
        utils: './utils',
        logs: './logs',
        temp: './temp',
        profiles: './temp/profiles',
        screenshots: './temp/screenshots',
        data: './data'
    },

    // Rate limiting and throttling
    rateLimiting: {
        requestsPerMinute: 30,
        requestsPerHour: 500,
        burstLimit: 10,

        // Platform-specific limits
        google: {
            accountsPerHour: 5,
            accountsPerDay: 20
        },

        kilocode: {
            registrationsPerHour: 10,
            registrationsPerDay: 50
        }
    },

    // Error handling and recovery
    errorHandling: {
        maxConsecutiveFailures: 5,
        failureThreshold: 0.3, // 30% failure rate threshold
        recoveryDelay: 60000, // 1 minute
        delayEnforcement: process.env.ERROR_DELAY_ENFORCEMENT !== 'false',
        maxConsecutiveGoogleFailures: parseInt(process.env.MAX_CONSECUTIVE_GOOGLE_FAILURES) || 3,
        automaticSelectorRefresh: process.env.AUTOMATIC_SELECTOR_REFRESH === 'true',
        escalationLevels: [
            'retry',
            'rotate_proxy',
            'restart_browser',
            'pause_automation'
        ]
    },

    // Health monitoring
    monitoring: {
        enabled: true,
        checkInterval: 30000, // 30 seconds
        alertThresholds: {
            errorRate: 0.25,
            responseTime: 10000,
            memoryUsage: 0.8,
            cpuUsage: 0.9
        }
    }
};

// Export individual configurations for easy access
module.exports.getBrowserArgs = () => module.exports.browser.args;
module.exports.getProxyConfig = () => module.exports.proxy;
module.exports.getAutomationConfig = () => module.exports.automation;
module.exports.getLoggingConfig = () => module.exports.logging;