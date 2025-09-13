const logger = require('../utils/logger');
const captchaSolver = require('../utils/captcha-solver');
const errorHandler = require('../utils/error-handler');
const settings = require('../config/settings');

class KilocodeRegistration {
    constructor() {
        this.baseUrl = process.env.KILOCODE_BASE_URL || 'https://kilocode.com';
        this.loginUrl = `${this.baseUrl}/login`;
        this.dashboardUrl = `${this.baseUrl}/dashboard`;
        this.apiUrl = `${this.baseUrl}/api`;
        this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
        this.registrationDelay = parseInt(process.env.KILOCODE_REGISTRATION_DELAY) || 10000;
        this.bonusTimeout = parseInt(process.env.BONUS_COLLECTION_TIMEOUT) || 60;
    }

    async register(browser, googleAccount) {
        let page = null;
        let retryCount = 0;

        while (retryCount < this.maxRetries) {
            try {
                retryCount++;
                logger.info(`🔐 Registering on Kilocode (attempt ${retryCount}/${this.maxRetries})`);

                page = await browser.newPage();

                // Configure page for Kilocode
                await this.configurePage(page);

                // Navigate to Kilocode login page
                logger.debug('Navigating to Kilocode login page...');
                await page.goto(this.loginUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                await this.delay(this.randomDelay(2000, 4000));

                // Start Google OAuth process
                await this.initiateGoogleOAuth(page);

                // Handle Google OAuth authorization
                await this.handleGoogleOAuth(page, googleAccount);

                // Complete Kilocode registration
                const accountInfo = await this.completeRegistration(page);

                // Extract API key and important data
                const kilocodeData = await this.extractAccountData(page);

                const result = {
                    ...accountInfo,
                    ...kilocodeData,
                    registeredAt: new Date().toISOString()
                };

                logger.info(`✅ Kilocode registration completed successfully`);
                return result;

            } catch (error) {
                logger.error(`❌ Kilocode registration attempt ${retryCount} failed:`, error.message);

                if (retryCount >= this.maxRetries) {
                    throw new Error(`Failed to register on Kilocode after ${this.maxRetries} attempts: ${error.message}`);
                }

                // Close page before retry
                if (page) {
                    try {
                        await page.close();
                    } catch (closeError) {
                        logger.warn('Failed to close page:', closeError.message);
                    }
                }

                // Wait before retry
                const retryDelay = this.calculateRetryDelay(retryCount);
                logger.info(`⏳ Waiting ${retryDelay / 1000}s before retry...`);
                await this.delay(retryDelay);
            }
        }
    }

    async configurePage(page) {
        // Set realistic viewport and user agent
        await page.setViewport({ width: 1366, height: 768 });

        // Block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Add anti-detection measures
        await page.evaluateOnNewDocument(() => {
            // Hide automation indicators
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            // Mock plugins and languages
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        });

        logger.debug('Page configured for Kilocode registration');
    }

    async initiateGoogleOAuth(page) {
        logger.debug('🔍 Looking for Google OAuth button...');

        // Common selectors for Google OAuth buttons
        const googleOAuthSelectors = [
            'button[data-provider=\"google\"]',
            '.google-login-button',
            '[href*=\"oauth/google\"]',
            '.btn-google',
            '[class*=\"google\"][class*=\"btn\"]'
        ];

        let oauthButton = null;

        // Try to find Google OAuth button
        for (const selector of googleOAuthSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 });
                oauthButton = await page.$(selector);
                if (oauthButton) {
                    logger.debug(`Found Google OAuth button with selector: ${selector}`);
                    break;
                }
            } catch (error) {
                // Continue to next selector
            }
        }

        // If no button found, try text-based search
        if (!oauthButton) {
            logger.debug('Trying text-based search for Google OAuth button...');

            // Use evaluate to find buttons/links containing 'Google' text
            const googleElements = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, a'));
                return buttons
                    .map((el, index) => ({
                        index,
                        tagName: el.tagName,
                        text: el.textContent || '',
                        href: el.href || '',
                        title: el.title || ''
                    }))
                    .filter(item =>
                        item.text.toLowerCase().includes('google') ||
                        item.href.includes('google') ||
                        item.title.toLowerCase().includes('google') ||
                        item.text.toLowerCase().includes('continue with') ||
                        item.text.toLowerCase().includes('sign in with')
                    );
            });

            if (googleElements.length > 0) {
                // Get the first matching element by index
                const elements = await page.$$('button, a');
                oauthButton = elements[googleElements[0].index];
                logger.debug(`Found Google OAuth element via text search: ${googleElements[0].text}`);
            } else {
                // Fallback to title attribute search
                oauthButton = await page.$('[title*=\"Google\"]');
            }
        }

        if (!oauthButton) {
            throw new Error('Could not find Google OAuth button on Kilocode login page');
        }

        logger.debug('🚀 Clicking Google OAuth button...');

        // Set up popup detection before clicking
        const browser = page.browser();
        let popup = null;

        browser.once('targetcreated', async (target) => {
            if (target.type() === 'page') {
                popup = await target.page();
                logger.debug('🪟 OAuth popup detected');
            }
        });

        // Click the OAuth button
        await oauthButton.click();

        // Wait a moment for popup to potentially appear
        await this.delay(this.randomDelay(2000, 4000));

        // Check if popup opened or navigation happened on current page
        if (popup) {
            logger.debug('📂 Using popup window for OAuth');
        } else {
            // Check if current page navigated
            const currentUrl = page.url();
            if (currentUrl.includes('accounts.google.com')) {
                logger.debug('📄 Using same page for OAuth (no popup)');
            } else {
                // Wait for navigation on current page
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            }
        }

        await this.delay(this.randomDelay(2000, 4000));
        logger.info('✅ Google OAuth initiated successfully');
    }

    async handleGoogleOAuth(page, googleAccount) {
        logger.debug('🔐 Handling Google OAuth authorization...');

        // Check if there's a popup window for OAuth
        const browser = page.browser();
        const pages = await browser.pages();

        let oauthPage = page; // Default to current page

        // Look for Google OAuth page in any open tab/popup
        for (const p of pages) {
            const url = p.url();
            if (url.includes('accounts.google.com')) {
                oauthPage = p;
                logger.debug('🔍 Found OAuth page in browser tabs/popups');
                break;
            }
        }

        const currentUrl = oauthPage.url();

        // Check if we're on Google's OAuth page
        if (currentUrl.includes('accounts.google.com')) {
            logger.debug('On Google OAuth consent page');

            try {
                // Wait for email input or account selection
                const emailInput = await oauthPage.$('#identifierId');

                if (emailInput) {
                    // Need to log in to Google
                    logger.debug('Logging in to Google account...');

                    await this.typeHumanLike(oauthPage, '#identifierId', googleAccount.email);
                    await this.delay(this.randomDelay(1000, 2000));

                    // Click next
                    await oauthPage.click('#identifierNext');
                    await oauthPage.waitForSelector('[type=\"password\"]', { timeout: 10000 });
                    await this.delay(this.randomDelay(1000, 2000));

                    // Enter password
                    await this.typeHumanLike(oauthPage, '[type=\"password\"]', googleAccount.password);
                    await this.delay(this.randomDelay(1000, 2000));

                    // Click next
                    await oauthPage.click('#passwordNext');
                    await this.delay(this.randomDelay(3000, 5000));
                } else {
                    // Account might already be logged in, look for account selection
                    const accountSelectors = [
                        '[data-identifier]',
                        '[data-email]',
                        '.BHzsHc',
                        '[role=\"button\"][data-authuser]'
                    ];

                    let accountSelected = false;
                    for (const selector of accountSelectors) {
                        const accounts = await oauthPage.$$(selector);
                        for (const account of accounts) {
                            const accountText = await account.evaluate(el => el.textContent || el.getAttribute('data-identifier'));
                            if (accountText && accountText.includes(googleAccount.email)) {
                                logger.debug('Selecting matching Google account...');
                                await account.click();
                                accountSelected = true;
                                break;
                            }
                        }
                        if (accountSelected) break;
                    }

                    if (!accountSelected) {
                        // Try to click the first account
                        const firstAccount = await oauthPage.$(accountSelectors[0]);
                        if (firstAccount) {
                            await firstAccount.click();
                        }
                    }
                }

                // Handle consent screen
                await this.handleOAuthConsent(oauthPage);

            } catch (error) {
                logger.error('Error during Google OAuth:', error.message);
                throw new Error(`Google OAuth failed: ${error.message}`);
            }

        } else if (currentUrl.includes(this.baseUrl)) {
            logger.debug('Already redirected back to Kilocode - OAuth might be complete');
        } else {
            throw new Error(`Unexpected URL during OAuth: ${currentUrl}`);
        }

        // Wait for redirect back to Kilocode
        logger.debug('⏳ Waiting for redirect back to Kilocode...');
        await this.waitForKilocodeRedirect(page, oauthPage);

        logger.info('✅ Google OAuth authorization completed');
    }

    async handleOAuthConsent(page) {
        logger.debug('📋 Handling OAuth consent screen...');

        try {
            // Look for consent/authorization buttons
            const consentSelectors = [
                '[id*=\"submit\"][value*=\"Allow\"]',
                '[id*=\"submit\"][value*=\"Continue\"]',
                'button[type=\"submit\"]',
                '[data-is-touch-wrapper=\"true\"] button',
                '[jsname=\"LgbsSe\"]'
            ];

            let consentButton = null;
            for (const selector of consentSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    const button = await page.$(selector);
                    if (button) {
                        const buttonText = await button.evaluate(el => el.textContent || el.value || '');
                        if (buttonText.toLowerCase().includes('allow') ||
                            buttonText.toLowerCase().includes('continue') ||
                            buttonText.toLowerCase().includes('accept')) {
                            consentButton = button;
                            break;
                        }
                    }
                } catch (error) {
                    // Continue to next selector
                }
            }

            if (consentButton) {
                logger.debug('✅ Clicking OAuth consent button...');
                await consentButton.click();
                await this.delay(this.randomDelay(2000, 4000));
            } else {
                logger.debug('No explicit consent button found - OAuth might auto-approve');
            }

        } catch (error) {
            logger.warn('OAuth consent handling warning:', error.message);
            // Continue anyway - consent might not be required
        }
    }

    async waitForKilocodeRedirect(mainPage, oauthPage = null) {
        try {
            // Poll all browser pages to find the one that redirects back to Kilocode
            const browser = mainPage.browser();
            const timeout = 30000;
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
                const pages = await browser.pages();

                for (const page of pages) {
                    const url = page.url();
                    if (url.includes(this.baseUrl)) {
                        logger.debug('✅ Successfully redirected back to Kilocode');

                        // If this is not the main page, we might need to switch focus
                        if (page !== mainPage) {
                            logger.debug('🔄 OAuth completed on different page/popup');
                        }

                        await this.delay(this.randomDelay(2000, 4000));
                        return page; // Return the page that has Kilocode
                    }
                }

                // Wait a bit before checking again
                await this.delay(1000);
            }

            throw new Error('Timeout waiting for redirect back to Kilocode');

        } catch (error) {
            logger.warn('Redirect timeout - checking current URLs...');

            const browser = mainPage.browser();
            const pages = await browser.pages();

            for (const page of pages) {
                const currentUrl = page.url();
                logger.debug(`Page URL: ${currentUrl}`);

                if (currentUrl.includes(this.baseUrl)) {
                    logger.debug('Found Kilocode page');
                    return page;
                }
            }

            throw new Error('Failed to redirect back to Kilocode');
        }
    }

    async completeRegistration(page) {
        logger.debug('🎯 Completing Kilocode registration...');

        try {
            // Wait for dashboard or registration completion
            const completionSelectors = [
                '[data-testid=\"dashboard\"]',
                '.dashboard',
                '[href*=\"dashboard\"]',
                '.welcome-message',
                '[data-api-key]'
            ];

            await Promise.race(
                completionSelectors.map(selector =>
                    page.waitForSelector(selector, { timeout: 10000 })
                )
            );

            // Check if additional information is required
            await this.handleAdditionalInfo(page);

            logger.info('✅ Kilocode registration completed');

            return {
                status: 'registered',
                platform: 'kilocode',
                registrationMethod: 'google_oauth'
            };

        } catch (error) {
            logger.error('Registration completion error:', error.message);
            throw new Error(`Failed to complete registration: ${error.message}`);
        }
    }

    async handleAdditionalInfo(page) {
        try {
            // Check for additional information forms
            const additionalInfoSelectors = [
                '[name=\"company\"]',
                '[name=\"phone\"]',
                '[name=\"website\"]',
                '.onboarding-form',
                '.profile-form'
            ];

            let hasAdditionalInfo = false;
            for (const selector of additionalInfoSelectors) {
                const element = await page.$(selector);
                if (element) {
                    hasAdditionalInfo = true;
                    break;
                }
            }

            if (hasAdditionalInfo) {
                logger.debug('📝 Filling additional information...');

                // Fill company name if present
                const companyField = await page.$('[name=\"company\"]');
                if (companyField) {
                    await this.typeHumanLike(page, '[name=\"company\"]', 'Tech Solutions Inc.');
                    await this.delay(this.randomDelay(500, 1000));
                }

                // Fill website if present
                const websiteField = await page.$('[name=\"website\"]');
                if (websiteField) {
                    await this.typeHumanLike(page, '[name=\"website\"]', 'https://example.com');
                    await this.delay(this.randomDelay(500, 1000));
                }

                // Submit additional info
                const submitSelectors = [
                    'button[type=\"submit\"]',
                    '.btn-primary',
                    '[data-testid=\"submit\"]'
                ];

                for (const selector of submitSelectors) {
                    const submitButton = await page.$(selector);
                    if (submitButton) {
                        await submitButton.click();
                        await this.delay(this.randomDelay(2000, 4000));
                        break;
                    }
                }
            }

        } catch (error) {
            logger.warn('Additional info handling warning:', error.message);
            // Continue anyway
        }
    }

    async extractAccountData(page) {
        logger.debug('📊 Extracting account data...');

        const accountData = {
            apiKey: null,
            userId: null,
            email: null,
            accountType: null,
            credits: null
        };

        try {
            // Try to extract API key
            const apiKeySelectors = [
                '[data-api-key]',
                '.api-key',
                '#apiKey',
                '[data-testid=\"api-key\"]'
            ];

            for (const selector of apiKeySelectors) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        const apiKey = await element.evaluate(el =>
                            el.textContent || el.value || el.getAttribute('data-api-key')
                        );
                        if (apiKey && apiKey.length > 10) {
                            accountData.apiKey = apiKey.trim();
                            logger.debug(`✅ API key extracted: ${apiKey.substring(0, 10)}...`);
                            break;
                        }
                    }
                } catch (error) {
                    // Continue to next selector
                }
            }

            // Try to extract user ID
            try {
                const userId = await page.evaluate(() => {
                    // Look for user ID in various places
                    const urlMatch = window.location.href.match(/user[/_]id[=/_](\w+)/);
                    if (urlMatch) return urlMatch[1];

                    const dataAttrs = document.querySelector('[data-user-id]');
                    if (dataAttrs) return dataAttrs.getAttribute('data-user-id');

                    // Check localStorage
                    const localUser = localStorage.getItem('user') || localStorage.getItem('userId');
                    if (localUser) return JSON.parse(localUser).id || localUser;

                    return null;
                });

                if (userId) {
                    accountData.userId = userId;
                    logger.debug(`✅ User ID extracted: ${userId}`);
                }
            } catch (error) {
                logger.debug('Could not extract user ID');
            }

            // Try to extract email
            try {
                const emailSelectors = [
                    '[data-email]',
                    '.user-email',
                    '.profile-email'
                ];

                for (const selector of emailSelectors) {
                    const element = await page.$(selector);
                    if (element) {
                        const email = await element.evaluate(el =>
                            el.textContent || el.getAttribute('data-email')
                        );
                        if (email && email.includes('@')) {
                            accountData.email = email.trim();
                            logger.debug(`✅ Email confirmed: ${email}`);
                            break;
                        }
                    }
                }
            } catch (error) {
                logger.debug('Could not extract email from page');
            }

            // Try to extract account type/plan
            try {
                const planSelectors = [
                    '.plan-name',
                    '.account-type',
                    '[data-plan]'
                ];

                for (const selector of planSelectors) {
                    const element = await page.$(selector);
                    if (element) {
                        const plan = await element.evaluate(el =>
                            el.textContent || el.getAttribute('data-plan')
                        );
                        if (plan) {
                            accountData.accountType = plan.trim();
                            logger.debug(`✅ Account type: ${plan}`);
                            break;
                        }
                    }
                }
            } catch (error) {
                logger.debug('Could not extract account type');
            }

        } catch (error) {
            logger.warn('Account data extraction warning:', error.message);
        }

        return accountData;
    }

    async collectBonuses(browser) {
        logger.info('💰 Attempting to collect startup bonuses...');

        let page = null;
        const bonuses = {
            collected: [],
            total: 0,
            currency: 'credits'
        };

        try {
            page = await browser.newPage();
            await this.configurePage(page);

            // Navigate to dashboard or bonuses page
            const bonusUrls = [
                `${this.dashboardUrl}`,
                `${this.baseUrl}/bonuses`,
                `${this.baseUrl}/rewards`,
                `${this.baseUrl}/welcome`
            ];

            for (const url of bonusUrls) {
                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
                    await this.delay(this.randomDelay(2000, 4000));

                    // Look for bonus collection elements
                    const bonusFound = await this.findAndCollectBonuses(page, bonuses);
                    if (bonusFound) {
                        break;
                    }
                } catch (error) {
                    logger.debug(`Failed to load ${url}:`, error.message);
                    continue;
                }
            }

            if (bonuses.collected.length > 0) {
                logger.info(`✅ Collected ${bonuses.collected.length} bonuses totaling ${bonuses.total} ${bonuses.currency}`);
            } else {
                logger.warn('⚠️  No bonuses found to collect');
            }

            return bonuses;

        } catch (error) {
            logger.error('❌ Failed to collect bonuses:', error.message);
            return bonuses;
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (error) {
                    logger.warn('Failed to close bonus collection page:', error.message);
                }
            }
        }
    }

    async findAndCollectBonuses(page, bonuses) {
        let bonusesFound = false;

        try {
            // Look for welcome bonus
            const welcomeBonusSelectors = [
                '.welcome-bonus',
                '[data-bonus=\"welcome\"]',
                '.signup-bonus',
                '.claim-bonus'
            ];

            for (const selector of welcomeBonusSelectors) {
                const bonusElements = await page.$$(selector);
                for (const element of bonusElements) {
                    try {
                        const bonusInfo = await this.collectSingleBonus(page, element, 'welcome');
                        if (bonusInfo) {
                            bonuses.collected.push(bonusInfo);
                            bonuses.total += bonusInfo.amount;
                            bonusesFound = true;
                        }
                    } catch (error) {
                        logger.debug('Failed to collect bonus:', error.message);
                    }
                }
            }

            // Look for daily bonuses
            const dailyBonusSelectors = [
                '.daily-bonus',
                '[data-bonus=\"daily\"]',
                '.daily-reward'
            ];

            for (const selector of dailyBonusSelectors) {
                const bonusElements = await page.$$(selector);
                for (const element of bonusElements) {
                    try {
                        const bonusInfo = await this.collectSingleBonus(page, element, 'daily');
                        if (bonusInfo) {
                            bonuses.collected.push(bonusInfo);
                            bonuses.total += bonusInfo.amount;
                            bonusesFound = true;
                        }
                    } catch (error) {
                        logger.debug('Failed to collect daily bonus:', error.message);
                    }
                }
            }

        } catch (error) {
            logger.error('Error finding bonuses:', error.message);
        }

        return bonusesFound;
    }

    async collectSingleBonus(page, element, bonusType) {
        try {
            // Check if bonus is available for collection
            const isAvailable = await element.evaluate(el => {
                const text = el.textContent.toLowerCase();
                return text.includes('claim') || text.includes('collect') || !text.includes('claimed');
            });

            if (!isAvailable) {
                logger.debug(`${bonusType} bonus already claimed`);
                return null;
            }

            // Extract bonus amount if possible
            let amount = 0;
            try {
                const amountText = await element.evaluate(el => el.textContent);
                const amountMatch = amountText.match(/(\d+(?:\.\d+)?)/);
                if (amountMatch) {
                    amount = parseFloat(amountMatch[1]);
                }
            } catch (error) {
                logger.debug('Could not extract bonus amount');
            }

            // Click to collect bonus
            await element.click();
            await this.delay(this.randomDelay(1000, 3000));

            // Wait for confirmation or success message
            try {
                await page.waitForSelector('.success, .claimed, .collected', { timeout: 5000 });
            } catch (error) {
                // Confirmation might not appear - that's okay
            }

            logger.info(`✅ Collected ${bonusType} bonus: ${amount || 'unknown amount'}`);

            return {
                type: bonusType,
                amount: amount,
                collectedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.debug(`Failed to collect ${bonusType} bonus:`, error.message);
            return null;
        }
    }

    async typeHumanLike(page, selector, text) {
        await page.focus(selector);
        await this.delay(this.randomDelay(100, 300));

        for (const char of text) {
            await page.keyboard.type(char);
            await this.delay(this.randomDelay(50, 150));
        }
    }

    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    calculateRetryDelay(retryCount) {
        const baseDelay = 5000;
        const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
        const jitter = Math.random() * 2000;
        return Math.min(exponentialDelay + jitter, 60000);
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = KilocodeRegistration;