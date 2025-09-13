const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserPreferencesPlugin = require('puppeteer-extra-plugin-user-preferences');
const proxyChain = require('proxy-chain');
const logger = require('../utils/logger');
const DolphinAnty = require('./dolphin-anty');

// Configure stealth plugin
puppeteer.use(StealthPlugin());

class StealthBrowser {
    constructor() {
        this.dolphinAnty = new DolphinAnty();
        this.anonymizedProxyUrl = null; // Store proxy-chain URL for cleanup
        this.defaultOptions = {
            headless: process.env.BROWSER_HEADLESS === 'true',
            timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
            viewport: {
                width: parseInt(process.env.BROWSER_VIEWPORT_WIDTH) || 1366,
                height: parseInt(process.env.BROWSER_VIEWPORT_HEIGHT) || 768
            },
            slowMo: parseInt(process.env.SLOW_MO) || 0
        };
    }

    async launch(profileId = null, options = {}) {
        const config = { ...this.defaultOptions, ...options };

        try {
            logger.info('🚀 Launching stealth browser...');

            // Setup proxy if provided
            if (options.proxy) {
                await this.setupProxy(options.proxy);
            }

            let browser;

            if (profileId) {
                // Launch with Dolphin Anty profile
                browser = await this.launchWithDolphinAnty(profileId, config);
            } else {
                // Launch regular stealth browser
                browser = await this.launchRegular(config);
            }

            // Configure browser
            await this.configureBrowser(browser, config);

            logger.info('✅ Stealth browser launched successfully');
            return browser;

        } catch (error) {
            logger.error('❌ Failed to launch stealth browser:', error.message);
            // Cleanup proxy on failure
            await this.cleanupProxy();
            throw new Error(`Browser launch failed: ${error.message}`);
        }
    }

    async launchWithDolphinAnty(profileId, config) {
        logger.debug(`🐬 Launching browser with Dolphin Anty profile: ${profileId}`);

        try {
            // Start Dolphin Anty profile
            const profileInfo = await this.dolphinAnty.startProfile(profileId);

            if (!profileInfo.wsEndpoint) {
                throw new Error('No WebSocket endpoint returned from Dolphin Anty');
            }

            // Connect to Dolphin Anty browser
            const browser = await puppeteer.connect({
                browserWSEndpoint: profileInfo.wsEndpoint,
                defaultViewport: null
            });

            logger.debug(`✅ Connected to Dolphin Anty browser: ${profileId}`);
            return browser;

        } catch (error) {
            logger.error(`Failed to launch with Dolphin Anty profile ${profileId}:`, error.message);
            throw error;
        }
    }

    async launchRegular(config) {
        logger.debug('🔧 Launching regular stealth browser...');

        const launchOptions = {
            headless: config.headless,
            slowMo: config.slowMo,
            defaultViewport: config.viewport,

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
                '--disable-ipc-flooding-protection',
                '--enable-features=NetworkService,NetworkServiceInProcess',
                '--force-color-profile=srgb',
                '--metrics-recording-only',
                '--use-mock-keychain',
                '--enable-precise-memory-info',
                '--disable-default-apps'
            ],

            ignoreHTTPSErrors: true,
            ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection']
        };

        // Add proxy configuration if available
        const proxyConfig = await this.getProxyConfiguration();
        if (proxyConfig) {
            launchOptions.args.push(`--proxy-server=${proxyConfig}`);
            logger.debug(`Using proxy: ${proxyConfig}`);
        }

        // If we have an anonymized proxy from proxy-chain, use it
        if (this.anonymizedProxyUrl) {
            launchOptions.args = launchOptions.args.filter(arg => !arg.startsWith('--proxy-server='));
            launchOptions.args.push(`--proxy-server=${this.anonymizedProxyUrl}`);
            logger.debug(`Using anonymized proxy: ${this.anonymizedProxyUrl}`);
        }

        const browser = await puppeteer.launch(launchOptions);
        logger.debug('✅ Regular stealth browser launched');
        return browser;
    }

    async configureBrowser(browser, config) {
        logger.debug('⚙️  Configuring browser settings...');

        try {
            // Get the default page or create one
            const pages = await browser.pages();
            let page = pages[0];

            if (!page) {
                page = await browser.newPage();
            }

            // Configure page settings
            await this.configurePage(page, config);

            // Set user preferences
            await this.setUserPreferences(browser);

            // Apply additional stealth measures
            await this.applyStealthMeasures(page);

            logger.debug('✅ Browser configuration completed');

        } catch (error) {
            logger.warn('Warning during browser configuration:', error.message);
            // Don't throw error for configuration failures
        }
    }

    async configurePage(page, config) {
        // Set viewport
        await page.setViewport(config.viewport);

        // Set realistic user agent
        const userAgent = this.getRandomUserAgent();
        await page.setUserAgent(userAgent);

        // Set language preferences
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });

        // Configure request interception for performance
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();

            // Block unnecessary resources in headless mode
            if (config.headless && ['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Set default timeout
        page.setDefaultTimeout(config.timeout);
        page.setDefaultNavigationTimeout(config.timeout);

        logger.debug('Page configured with stealth settings');
    }

    async setUserPreferences(browser) {
        try {
            // Configure user preferences plugin
            puppeteer.use(UserPreferencesPlugin({
                userPrefs: {
                    webkit: {
                        webprefs: {
                            default_encoding: 'UTF-8'
                        }
                    },
                    profile: {
                        default_content_setting_values: {
                            notifications: 2, // Block notifications
                            geolocation: 2,   // Block location
                            media_stream: 2   // Block camera/mic
                        },
                        managed_default_content_settings: {
                            images: 1
                        }
                    }
                }
            }));

            logger.debug('User preferences configured');

        } catch (error) {
            logger.debug('User preferences configuration skipped:', error.message);
        }
    }

    async applyStealthMeasures(page) {
        await page.evaluateOnNewDocument(() => {
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                        description: 'Portable Document Format',
                        filename: 'internal-pdf-viewer',
                        length: 1,
                        name: 'Chrome PDF Plugin'
                    },
                    {
                        0: { type: 'application/pdf', suffixes: 'pdf', description: '' },
                        description: '',
                        filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                        length: 1,
                        name: 'Chrome PDF Viewer'
                    }
                ]
            });

            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });

            // Mock hardware concurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 4
            });

            // Mock device memory
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8
            });

            // Override permissions query
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Mock connection
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 100,
                    downlink: 2.0
                })
            });

            // Hide automation indicators
            delete window.chrome.runtime.onConnect;
            delete window.chrome.runtime.onMessage;

            // Mock WebGL
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
                    return 'Intel Inc.';
                }
                if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter.apply(this, arguments);
            };

            // Mock screen properties
            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

            // Mock timezone
            Date.prototype.getTimezoneOffset = () => new Date().getTimezoneOffset();
        });

        logger.debug('Advanced stealth measures applied');
    }

    async getProxyConfiguration() {
        try {
            const proxyHost = process.env.PROXY_HOST;
            const proxyPort = process.env.PROXY_PORT;
            const proxyUsername = process.env.PROXY_USERNAME;
            const proxyPassword = process.env.PROXY_PASSWORD;
            const proxyType = process.env.PROXY_TYPE || 'http';

            if (proxyHost && proxyPort) {
                if (proxyUsername && proxyPassword) {
                    return `${proxyType}://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;
                } else {
                    return `${proxyType}://${proxyHost}:${proxyPort}`;
                }
            }

            return null;

        } catch (error) {
            logger.warn('Failed to configure proxy:', error.message);
            return null;
        }
    }

    getRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    async createStealthPage(browser, options = {}) {
        const page = await browser.newPage();

        // Apply page-specific stealth measures
        await this.configurePage(page, { ...this.defaultOptions, ...options });

        // Additional page stealth measures
        await page.evaluateOnNewDocument(() => {
            // Mock battery API
            Object.defineProperty(navigator, 'getBattery', {
                get: () => () => Promise.resolve({
                    charging: true,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: 1
                })
            });

            // Mock gamepad API
            Object.defineProperty(navigator, 'getGamepads', {
                get: () => () => []
            });

            // Mock canvas fingerprinting
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(...args) {
                // Add small amount of noise to canvas fingerprinting
                const context = this.getContext('2d');
                if (context) {
                    context.fillStyle = 'rgba(255, 255, 255, 0.01)';
                    context.fillRect(0, 0, 1, 1);
                }
                return originalToDataURL.apply(this, args);
            };
        });

        logger.debug('Stealth page created with advanced measures');
        return page;
    }

    async addStealthHeaders(page) {
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': this.getRandomUserAgent()
        });
    }

    async humanLikeDelay(min = 500, max = 2000) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    async humanLikeMouseMovement(page, selector) {
        try {
            const element = await page.$(selector);
            if (element) {
                const box = await element.boundingBox();
                if (box) {
                    // Move to element with some randomness
                    const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
                    const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;

                    await page.mouse.move(x, y, { steps: 10 });
                    await this.humanLikeDelay(100, 300);
                }
            }
        } catch (error) {
            logger.debug('Human-like mouse movement failed:', error.message);
        }
    }

    async humanLikeClick(page, selector) {
        await this.humanLikeMouseMovement(page, selector);
        await page.click(selector);
        await this.humanLikeDelay(200, 800);
    }

    async humanLikeType(page, selector, text) {
        await page.focus(selector);
        await this.humanLikeDelay(200, 500);

        for (const char of text) {
            await page.keyboard.type(char);
            await this.humanLikeDelay(50, 200);
        }
    }

    async setupProxy(proxyConfig) {
        try {
            if (proxyConfig.username && proxyConfig.password) {
                logger.debug('🔗 Setting up proxy-chain for authentication...');

                const originalProxyUrl = `${proxyConfig.type || 'http'}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;

                // Create anonymized proxy
                this.anonymizedProxyUrl = await proxyChain.anonymizeProxy(originalProxyUrl);

                logger.debug(`✅ Proxy anonymized: ${this.anonymizedProxyUrl}`);
            } else {
                logger.debug('No proxy credentials provided, using direct proxy connection');
            }
        } catch (error) {
            logger.error('Failed to setup proxy-chain:', error.message);
            throw error;
        }
    }

    async cleanupProxy() {
        try {
            if (this.anonymizedProxyUrl) {
                logger.debug('🧹 Cleaning up proxy-chain...');
                await proxyChain.closeAnonymizedProxy(this.anonymizedProxyUrl, true);
                this.anonymizedProxyUrl = null;
                logger.debug('✅ Proxy-chain cleaned up');
            }
        } catch (error) {
            logger.warn('Warning during proxy cleanup:', error.message);
        }
    }
}

module.exports = StealthBrowser;