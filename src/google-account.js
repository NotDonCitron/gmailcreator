const logger = require('../utils/logger');
const captchaSolver = require('../utils/captcha-solver');
const errorHandler = require('../utils/error-handler');
const settings = require('../config/settings');
const getSmsProvider = require('./providers/sms-provider');
const fs = require('fs-extra');
const path = require('path');

class GoogleAccount {
    constructor() {
        this.signupUrl = 'https://accounts.google.com/signup/v2/webcreateaccount';
        this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
        this.delayMin = parseInt(process.env.GOOGLE_SIGNUP_DELAY_MIN) || 5000;
        this.delayMax = parseInt(process.env.GOOGLE_SIGNUP_DELAY_MAX) || 15000;
    }

    async create(browser, userData, options = {}) {
        let page = null;
        let retryCount = 0;
        const { debugMode = false } = options;

        while (retryCount < this.maxRetries) {
            try {
                retryCount++;
                logger.info(`📧 Creating Google account (attempt ${retryCount}/${this.maxRetries})`);

                page = await browser.newPage();

                // Configure page settings
                await this.configurePage(page, userData);

                // Navigate to Google signup
                logger.debug('Navigating to Google signup page...');
                await page.goto(this.signupUrl + '?hl=en&flowName=GlifWebSignIn&flowEntry=SignUp', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                // Wait for page to load
                await this.delay(this.randomDelay(2000, 5000));

                // Fill basic information
                await this.fillBasicInfo(page, userData);

                // Handle phone verification
                await this.handlePhoneVerification(page, userData);

                // Handle email verification
                await this.handleEmailVerification(page);

                // Handle captcha if present
                await this.handleCaptcha(page);

                // Complete account creation
                const accountInfo = await this.completeAccountCreation(page, userData);

                logger.info(`✅ Google account created successfully: ${accountInfo.email}`);
                return accountInfo;

            } catch (error) {
                logger.error(`❌ Google account creation attempt ${retryCount} failed:`, error.message);

                if (retryCount >= this.maxRetries) {
                    if (debugMode && page) {
                        logger.warn('🚨 DEBUG MODE: Keeping browser open for manual inspection. Close manually when done.');
                        // Don't close the page in debug mode so user can inspect
                        throw new Error(`Failed to create Google account after ${this.maxRetries} attempts: ${error.message}`);
                    }
                    throw new Error(`Failed to create Google account after ${this.maxRetries} attempts: ${error.message}`);
                }

                // Close page before retry (unless in debug mode and final failure)
                if (page && !debugMode) {
                    try {
                        await page.close();
                    } catch (closeError) {
                        logger.warn('Failed to close page:', closeError.message);
                    }
                } else if (debugMode && page) {
                    logger.info('🚨 DEBUG MODE: Keeping page open for inspection during retry');
                }

                // Wait before retry
                const retryDelay = this.calculateRetryDelay(retryCount);
                logger.info(`⏳ Waiting ${retryDelay / 1000}s before retry...`);
                await this.delay(retryDelay);
            }
        }
    }

    async configurePage(page, userData = {}) {
        // Set user agent and viewport
        await page.setUserAgent(userData.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        // Block unnecessary resources using settings to avoid breaking UI
        await page.setRequestInterception(true);
        const block = (settings.performance && settings.performance.blockResources) || {};
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (
                (resourceType === 'image' && block.images) ||
                (resourceType === 'font' && block.fonts) ||
                (resourceType === 'media' && block.media) ||
                // Do NOT block stylesheets here to keep Google signup layout intact
                false
            ) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Add stealth measures
        await page.evaluateOnNewDocument(() => {
            // Remove webdriver property
            delete navigator.__proto__.webdriver;

            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        });

        logger.debug('Page configured with stealth settings');
    }

    async fillBasicInfo(page, userData) {
        logger.debug('Filling basic account information...');

        // Wait for first name field
        const firstNameSelectors = [
            '#firstName',
            'input[name="firstName"]',
            'input[aria-label*="First name" i]',
            'input[autocomplete="given-name"]'
        ];
        const lastNameSelectors = [
            '#lastName',
            'input[name="lastName"]',
            'input[aria-label*="Last name" i]',
            'input[autocomplete="family-name"]'
        ];
        
        // Wait for any first name field to appear
        let firstNameSelectorFound = null;
        for (const sel of firstNameSelectors) {
            if (await page.$(sel)) {
                firstNameSelectorFound = sel;
                break;
            }
        }
        
        if (!firstNameSelectorFound) {
            throw new Error('First name field not found');
        }

        // Fill first and last name
        await this.typeHumanLike(page, firstNameSelectorFound, userData.firstName);
        await this.delay(this.randomDelay(400, 900));
        
        // Find and fill last name
        let lastNameSelectorFound = null;
        for (const sel of lastNameSelectors) {
            if (await page.$(sel)) {
                lastNameSelectorFound = sel;
                break;
            }
        }
        
        if (!lastNameSelectorFound) {
            throw new Error('Last name field not found');
        }
        
        await this.typeHumanLike(page, lastNameSelectorFound, userData.lastName);
        await this.delay(this.randomDelay(400, 900));

        // Try to locate a username field on this step; flows vary by region/UI
        // Updated selectors based on current Google signup page structure
        const usernameCandidates = [
            '#username',
            'input[name="Username"]',
            'input[name="username"]',
            'input[type="email"][name="Username"]',
            'input[type="email"][name="username"]',
            'input[aria-label*="username" i]',
            'input[aria-label*="gmail address" i]',
            'input[autocomplete="username"]',
            'input[aria-label*="Choose your username"]',
            'input[aria-label*="Choose a Gmail address"]',
            'input[data-initial-value][name="Username"]',
            'input[jscontroller][name="Username"]',
            'input[placeholder*="username" i]',
            // New: Email/Phone collection step
            '#emailPhone',
            'input[name="emailPhone"]',
            'input[aria-label*="Email address or phone number" i]',
            'input[aria-label*="email address" i]',
            'input[autocomplete="off"][aria-label*="email" i]'
        ];
        let usernameSelectorFound = null;
        for (const sel of usernameCandidates) {
            const exists = await page.$(sel);
            if (exists) {
                usernameSelectorFound = sel;
                break;
            }
        }

        // If username field is not present yet, proceed to next step until it appears or timeout
        if (!usernameSelectorFound) {
            logger.debug('Username field not present on current step, attempting to advance...');
            
            // First, try to click "Don't have an email address or phone number?" button
            try {
                // First try specific selectors for the button
                const noEmailSelectors = [
                    'button[jsname="Ebwmjd"]',
                    'button[jsaction*="wufpNd"]',
                    'button:has-text("Don\'t have an email address or phone number?")',
                ];

                let foundButton = false;
                for (const selector of noEmailSelectors) {
                    try {
                        const btn = await page.$(selector);
                        if (btn) {
                            logger.debug(`Clicking "Don't have email" button: ${selector}`);
                            await page.click(selector);
                            foundButton = true;
                            break;
                        }
                    } catch (_e) {}
                }

                // Fallback: search by text content
                if (!foundButton) {
                    await page.evaluate(() => {
                        const nodes = [...document.querySelectorAll('a,button,div[role="button"],span[role="button"]')];
                        const btnOrLink = nodes.find(el => {
                            const t = (el.innerText || el.textContent || '').toLowerCase().trim();
                            return (
                                // Exact text match first
                                t.includes("don't have an email address or phone number") ||
                                // German text options
                                t.includes("ich habe keine e-mail-adresse") ||
                                t.includes("keine e-mail-adresse") ||
                                t.includes("ich habe keine mail") ||
                                t.includes("neue gmail-adresse erstellen") ||
                                // English text options
                                t.includes("i don't have an email") ||
                                t.includes("don't have an email") ||
                                t.includes('create your own gmail address') ||
                                t.includes('create a gmail address') ||
                                t.includes('create your gmail address') ||
                                t.includes('gmail address instead') ||
                                t.includes('use a gmail address') ||
                                t.includes('use a gmail address instead') ||
                                t.includes('create a new gmail address')
                            );
                        });
                        if (btnOrLink) {
                            console.log('Found "no email" or "create gmail" button:', btnOrLink.textContent);
                            btnOrLink.click();
                            return true;
                        }
                        return false;
                    });
                }

                await this.delay(this.randomDelay(1500, 2500));
            } catch (_e) {}

            // After clicking "Don't have email", look for "Create own Gmail" radio button
            try {
                const createOwnGmailSelectors = [
                    'input[type="radio"][value="custom"]',
                    'input[name="usernameRadio"][value="custom"]',
                    'input[aria-label*="Create your own Gmail" i]',
                    'input[aria-label*="Create own Gmail" i]',
                    'input[jsname="YPqjbf"]'
                ];

                let foundRadio = false;
                for (const selector of createOwnGmailSelectors) {
                    try {
                        const radio = await page.$(selector);
                        if (radio) {
                            logger.debug(`Clicking "Create own Gmail" radio button: ${selector}`);
                            await page.click(selector);
                            foundRadio = true;
                            break;
                        }
                    } catch (_e) {}
                }

                if (foundRadio) {
                    await this.delay(this.randomDelay(1000, 2000));
                }
            } catch (_e) {}

            // Try to advance with Next button
            const possibleNexts = [
                '#collectNameNext',
                '#accountDetailsNext',
                'button[jsname="LgbsSe"]',
                'div[role="button"][jsname="LgbsSe"]',
                'button[type="button"][data-is-primary]',
                'button[class*="VfPpkd-LgbsSe"]',
                'div[role="button"][class*="VfPpkd-LgbsSe"]',
                'button[aria-label="Next"]',
                'div[role="button"][aria-label="Next"]'
            ];

            let clickedNext = false;
            for (const sel of possibleNexts) {
                const btn = await page.$(sel);
                if (btn) {
                    await page.click(sel);
                    clickedNext = true;
                    await this.delay(this.randomDelay(1500, 3000));
                    break;
                }
            }

            // Wait for username to appear after advancing
            const waitStart = Date.now();
            const waitTimeoutMs = 15000;
            while (!usernameSelectorFound && (Date.now() - waitStart) < waitTimeoutMs) {
                for (const sel of usernameCandidates) {
                    const exists = await page.$(sel);
                    if (exists) {
                        usernameSelectorFound = sel;
                        break;
                    }
                }
                if (!usernameSelectorFound) {
                    await this.delay(500);
                }
            }
        }

        // If still not found, try a fallback: sometimes Google asks birthday/gender before username
        if (!usernameSelectorFound) {
            logger.debug('Username still not visible. Trying to fill personal info step first...');
            await this.handlePersonalInfo(page, userData);

            // After filling personal info, look for the "Don't have email" button again
            // This is crucial - Google shows this button after birthday/gender step
            try {
                // First try specific selectors for the button
                const noEmailSelectors = [
                    'button[jsname="Ebwmjd"]',
                    'button[jsaction*="wufpNd"]',
                    'button:has-text("Don\'t have an email address or phone number?")',
                ];

                let foundButton = false;
                for (const selector of noEmailSelectors) {
                    try {
                        const btn = await page.$(selector);
                        if (btn) {
                            logger.debug(`Clicking "Don't have email" button after personal info: ${selector}`);
                            await page.click(selector);
                            foundButton = true;
                            break;
                        }
                    } catch (_e) {}
                }

                // Fallback: search by text content
                if (!foundButton) {
                    await page.evaluate(() => {
                        const nodes = [...document.querySelectorAll('a,button,div[role="button"],span[role="button"]')];
                        const btnOrLink = nodes.find(el => {
                            const t = (el.innerText || el.textContent || '').toLowerCase().trim();
                            return t.includes("don't have an email address or phone number");
                        });
                        if (btnOrLink) {
                            console.log('Found "no email" button after personal info:', btnOrLink.textContent);
                            btnOrLink.click();
                            return true;
                        }
                        return false;
                    });
                }

                if (foundButton) {
                    await this.delay(this.randomDelay(2000, 3500));
                }
            } catch (_e) {}

            // After clicking "Don't have email", look for "Create own Gmail" radio button
            try {
                const createOwnGmailSelectors = [
                    'input[type="radio"][value="custom"]',
                    'input[name="usernameRadio"][value="custom"]',
                    'input[aria-label*="Create your own Gmail" i]',
                    'input[aria-label*="Create own Gmail" i]',
                    'input[jsname="YPqjbf"]'
                ];

                let foundRadio = false;
                for (const selector of createOwnGmailSelectors) {
                    try {
                        const radio = await page.$(selector);
                        if (radio) {
                            logger.debug(`Clicking "Create own Gmail" radio button after personal info: ${selector}`);
                            await page.click(selector);
                            foundRadio = true;
                            break;
                        }
                    } catch (_e) {}
                }

                if (foundRadio) {
                    await this.delay(this.randomDelay(1500, 2500));
                }
            } catch (_e) {}

            // Try to advance with Next button
            const possibleNexts = [
                '#collectNameNext',
                '#accountDetailsNext',
                'button[jsname="LgbsSe"]',
                'div[role="button"][jsname="LgbsSe"]',
                'button[type="button"][data-is-primary]',
                'button[class*="VfPpkd-LgbsSe"]',
                'div[role="button"][class*="VfPpkd-LgbsSe"]',
                'button[aria-label="Next"]',
                'div[role="button"][aria-label="Next"]'
            ];

            let clickedNext = false;
            for (const sel of possibleNexts) {
                const btn = await page.$(sel);
                if (btn) {
                    await page.click(sel);
                    clickedNext = true;
                    await this.delay(this.randomDelay(1500, 3000));
                    break;
                }
            }

            // On some flows, after birthday/gender Google shows suggestions.
            // Click the "Create your own Gmail address" link to reveal the username input.
            try {
                await page.evaluate(() => {
                    const nodes = [...document.querySelectorAll('a,button,div[role="button"]')];
                    const target = nodes.find(el => {
                        const t = (el.innerText || el.textContent || '').toLowerCase().trim();
                        return (
                            t.includes('create your own gmail address') ||
                            t.includes('create a gmail address') ||
                            t.includes('create your gmail address')
                        );
                    });
                    if (target) target.click();
                });
                await this.delay(this.randomDelay(1200, 2200));
            } catch (_e) {}

            const waitStart2 = Date.now();
            const waitTimeoutMs2 = 15000;
            while (!usernameSelectorFound && (Date.now() - waitStart2) < waitTimeoutMs2) {
                for (const sel of usernameCandidates) {
                    const exists = await page.$(sel);
                    if (exists) {
                        usernameSelectorFound = sel;
                        break;
                    }
                }
                if (!usernameSelectorFound) {
                    await this.delay(600);
                }
            }
        }

        if (!usernameSelectorFound) {
            await this.captureDebug(page, 'no-username');
            try {
                const h1 = await page.$eval('h1', el => (el.textContent || '').trim());
                logger.debug(`Page H1: ${h1}`);
                const url = page.url();
                logger.debug(`Current URL: ${url}`);

                // Capture page title and visible text for debugging
                const title = await page.title();
                logger.debug(`Page title: ${title}`);

                const visibleText = await page.evaluate(() => {
                    return document.body.innerText.substring(0, 500);
                });
                logger.debug(`Visible text: ${visibleText}`);

                // Capture all input fields on page for debugging
                const inputs = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('input')).map(input => ({
                        name: input.name,
                        type: input.type,
                        id: input.id,
                        ariaLabel: input.getAttribute('aria-label'),
                        placeholder: input.placeholder
                    }));
                });
                logger.debug(`Available input fields: ${JSON.stringify(inputs, null, 2)}`);

            } catch (_e) {}
            throw new Error('Username field not found after navigating flow');
        }

        // Check if this is an email/phone field or username field
        const isEmailPhoneField = usernameSelectorFound.includes('emailPhone') ||
                                  usernameSelectorFound.includes('email') ||
                                  (await page.$eval(usernameSelectorFound, el => {
                                      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                                      return ariaLabel.includes('email address or phone') ||
                                             ariaLabel.includes('email address') ||
                                             ariaLabel.includes('phone number');
                                  })).catch(() => false);

        if (isEmailPhoneField) {
            // For email/phone fields, we should try to create a Gmail address instead
            logger.debug(`Email/phone field detected - attempting to create Gmail address`);
            
            // Check if we already clicked "Create own Gmail" earlier in the flow
            // If not, try to find and click it now
            const createGmailSelectors = [
                'input[type="radio"][value="custom"]',
                'input[name="usernameRadio"][value="custom"]',
                'input[aria-label*="Create your own Gmail" i]',
                'input[aria-label*="Create own Gmail" i]',
                'input[jsname="YPqjbf"]'
            ];

            let foundGmailOption = false;
            for (const selector of createGmailSelectors) {
                try {
                    const radio = await page.$(selector);
                    if (radio) {
                        // Check if it's already selected
                        const isSelected = await page.$eval(selector, el => el.checked);
                        if (!isSelected) {
                            logger.debug(`Clicking "Create own Gmail" radio button: ${selector}`);
                            await page.click(selector);
                            await this.delay(this.randomDelay(1000, 2000));
                        } else {
                            logger.debug(`"Create own Gmail" radio button already selected: ${selector}`);
                        }
                        foundGmailOption = true;
                        break;
                    }
                } catch (_e) {}
            }

            if (foundGmailOption) {
                // After clicking "Create own Gmail", look for the username field that should appear
                const usernameCandidates = [
                    '#username',
                    'input[name="Username"]',
                    'input[name="username"]',
                    'input[type="email"][name="Username"]',
                    'input[aria-label*="Choose your username"]',
                    'input[aria-label*="Choose a Gmail address"]',
                    'input[placeholder*="username" i]'
                ];

                let gmailUsernameField = null;
                for (const sel of usernameCandidates) {
                    const exists = await page.$(sel);
                    if (exists) {
                        gmailUsernameField = sel;
                        break;
                    }
                }

                if (gmailUsernameField) {
                    // Enter the Gmail address we want to create
                    const localPart = userData.email.split('@')[0];
                    logger.debug(`Entering Gmail username: ${localPart}`);
                    await this.typeHumanLike(page, gmailUsernameField, localPart);
                } else {
                    // If no Gmail username field appeared, try entering the email/phone field with our desired Gmail
                    const localPart = userData.email.split('@')[0];
                    logger.debug(`No Gmail field found, entering desired Gmail in email/phone field: ${localPart}`);
                    await this.typeHumanLike(page, usernameSelectorFound, localPart);
                }
            } else {
                // No Gmail creation option found, try entering our desired Gmail address
                const localPart = userData.email.split('@')[0];
                logger.debug(`No Gmail option found, entering desired Gmail: ${localPart}`);
                await this.typeHumanLike(page, usernameSelectorFound, localPart);
            }
        } else {
            // For traditional username fields, enter just the local part
            const localPart = userData.email.split('@')[0];
            logger.debug(`Entering username (local part): ${localPart}`);
            await this.typeHumanLike(page, usernameSelectorFound, localPart);
        }
        await this.delay(this.randomDelay(400, 900));

        // Fill password fields (selectors can vary slightly; check a couple of candidates)
        // Updated selectors for current Google Material Design
        // Identify the active password section by DOM context
        const pwdCandidates = [
            '[name="Passwd"]',
            'input[name="Passwd"]',
            'input[type="password"][name="Passwd"]',
            'input[type="password"][autocomplete="new-password"]',
            'input[aria-label*="Create a password"]',
            'input[aria-label*="Password"]',
            'input[jscontroller][type="password"]:first-of-type'
        ];
        const confirmCandidates = [
            '[name="ConfirmPasswd"]',
            'input[name="ConfirmPasswd"]',
            'input[type="password"][name="ConfirmPasswd"]',
            'input[type="password"][autocomplete="new-password"]:nth-of-type(2)',
            'input[aria-label*="Confirm your password"]',
            'input[aria-label*="Confirm"]',
            'input[jscontroller][type="password"]:nth-of-type(2)'
        ];
        const sectionHandle = await page.$x("//h1|//h2|//label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'password')]");
        const container = sectionHandle?.[0] ? await sectionHandle[0].evaluateHandle(el => el.closest('form') || el.closest('section') || document.body) : null;
        
        let pwdSel = null;
        let confirmSel = null;
        
        if (container) {
            // Within container, query for input[type='password']
            const fields = await container.$$('input[type="password"]');
            if (fields[0]) {
                pwdSel = fields[0];
            }
            if (fields[1]) {
                confirmSel = fields[1];
            }
        } else {
            // Fallback to the existing aria-label based selectors if scoping fails
            for (const sel of pwdCandidates) {
                if (await page.$(sel)) { pwdSel = sel; break; }
            }
            for (const sel of confirmCandidates) {
                if (await page.$(sel)) { confirmSel = sel; break; }
            }
        }

        if (!pwdSel || !confirmSel) {
            // Sometimes password fields appear after pressing next once more
            logger.debug('Password fields not present; attempting to advance to password step...');
            try {
                await page.click('button[jsname="LgbsSe"]');
                await this.delay(this.randomDelay(1500, 3000));
            } catch (_e) {}

            for (const sel of pwdCandidates) {
                if (await page.$(sel)) { pwdSel = sel; break; }
            }
            for (const sel of confirmCandidates) {
                if (await page.$(sel)) { confirmSel = sel; break; }
            }
        }

        if (!pwdSel) {
            throw new Error('Password field not found in flow');
        }

        // Some Google flows only show one password field
        if (!confirmSel) {
            logger.debug('Confirm password field not found - single password field flow detected');
            await this.typeHumanLike(page, pwdSel, userData.password);
            await this.delay(this.randomDelay(800, 1500));
        } else {
            // Standard two-password flow
            await this.typeHumanLike(page, pwdSel, userData.password);
            await this.delay(this.randomDelay(400, 900));
            await this.typeHumanLike(page, confirmSel, userData.password);
            await this.delay(this.randomDelay(800, 1500));
        }

        // Click next/continue to finalize account details step
        logger.debug('Clicking next button to proceed...');
        const nextCandidates = ['#accountDetailsNext', 'button[jsname="LgbsSe"]', 'div[role="button"][jsname="LgbsSe"]'];
        let clicked = false;
        for (const sel of nextCandidates) {
            const btn = await page.$(sel);
            if (btn) {
                await page.click(sel);
                clicked = true;
                break;
            }
        }

        if (clicked) {
            try {
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
            } catch (_e) {
                // If no navigation, continue — some flows update inline
                await this.delay(this.randomDelay(1200, 2000));
            }
        } else {
            logger.warn('Could not find a next/continue button after filling details');
        }

        logger.debug('✅ Basic information filled successfully');
    }

    async handlePhoneVerification(page, userData) {
        try {
            logger.debug('Checking for phone verification...');

            // Quick bypass for dev/testing if configured
            if (settings.development?.skipPhoneVerification) {
                logger.warn('⚠️  Phone verification is configured to be skipped (development.skipPhoneVerification=true)');
                return;
            }

            const phoneSelector = 'input[type="tel"]';
            const skipSelector = '[data-is-touch-wrapper="true"] button';

            const element = await Promise.race([
                page.waitForSelector(phoneSelector, { timeout: 5000 }).then(() => 'phone'),
                page.waitForSelector(skipSelector, { timeout: 5000 }).then(() => 'skip'),
                this.delay(5000).then(() => 'timeout')
            ]);

            if (element === 'skip') {
                logger.info('📱 Skipping phone verification (skip button available)');
                await page.click(skipSelector);
                await this.delay(this.randomDelay(2000, 3000));
                return;
            }

            if (element !== 'phone') {
                logger.debug('No phone verification step detected');
                return;
            }

            logger.info('📱 Phone verification required');

            // Resolve phone number (user data > env > settings)
            const resolvedPhone =
                userData.phoneNumber ||
                process.env.SMS_MANUAL_PHONE ||
                settings.sms?.manualPhone ||
                '';

            if (!resolvedPhone) {
                logger.warn('⚠️  Phone number missing. Provide userData.phoneNumber or set SMS_MANUAL_PHONE for mock/manual testing.');
                throw new Error('Phone number missing for verification');
            }

            // Blacklist enforcement (policy)
            try {
                const list = (process.env.SMS_BLACKLIST || '+491732114133')
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
                if (list.includes(resolvedPhone.trim())) {
                    logger.warn(`⚠️  Phone number ${resolvedPhone} is blacklisted by policy; skipping verification step.`);
                    throw new Error('Phone number is blacklisted by policy');
                }
            } catch (_e) {
                // continue
            }

            // Fill phone number
            await this.typeHumanLike(page, phoneSelector, resolvedPhone);
            await this.delay(this.randomDelay(800, 1500));

            // Click Next/Continue to request SMS code
            await page.click('[jsname="LgbsSe"]');
            await this.delay(this.randomDelay(2500, 4000));

            // Wait for the verification code input to appear
            // Google often uses another input[type="tel"] for the SMS code as well.
            // We'll first wait for navigation or a new tel input to ensure we are at the code step.
            await Promise.race([
                page.waitForSelector('input[type="tel"]', { timeout: 15000 }),
                page.waitForSelector('input[name="code"]', { timeout: 15000 }).catch(() => null)
            ]);

            // Acquire code via provider (mock/manual by default)
            const provider = getSmsProvider();
            const timeoutMs = (settings.google?.phoneVerificationTimeout || 300) * 1000;

            logger.info('📨 Waiting for SMS verification code (mock/manual provider)...');
            const code = await provider.waitForCode({ timeoutMs });

            if (!code || typeof code !== 'string' || code.trim().length < 4) {
                throw new Error('No SMS code provided/received');
            }

            const codeValue = code.trim();

            // Try multiple selectors for the code field
            const codeSelectors = [
                'input[name="code"]',
                'input[aria-label*="code" i]',
                'input[type="tel"]'
            ];

            let filled = false;
            for (const sel of codeSelectors) {
                const exists = await page.$(sel);
                if (exists) {
                    await this.typeHumanLike(page, sel, codeValue);
                    filled = true;
                    break;
                }
            }

            if (!filled) {
                throw new Error('Could not locate verification code input field');
            }

            await this.delay(this.randomDelay(800, 1500));

            // Submit code (Next/Verify)
            await page.click('[jsname="LgbsSe"]');
            await this.delay(this.randomDelay(2500, 4000));

            logger.info('✅ Phone verification code submitted');

        } catch (error) {
            logger.error('Phone verification error:', error.message);
            // Continue even if phone verification fails - main flow will decide on retry
        }
    }

    async handleEmailVerification(page) {
        try {
            logger.debug('Checking for email verification...');

            // Look for recovery email input
            const recoveryEmailSelector = '[type=\"email\"]';
            const skipSelector = 'button[jsname=\"YqO5N\"]';

            const hasRecoveryEmail = await page.$(recoveryEmailSelector);

            if (hasRecoveryEmail) {
                logger.debug('📧 Recovery email step detected');

                // Try to skip recovery email
                const skipButton = await page.$(skipSelector);
                if (skipButton) {
                    logger.debug('Skipping recovery email');
                    await page.click(skipSelector);
                    await this.delay(this.randomDelay(2000, 3000));
                } else {
                    logger.debug('No skip option available for recovery email');
                }
            }

        } catch (error) {
            logger.error('Email verification error:', error.message);
            // Continue even if email verification fails
        }
    }

    async handleCaptcha(page) {
        try {
            logger.debug('Checking for captcha...');

            // Look for reCAPTCHA
            const recaptchaFrame = await page.$('iframe[src*=\"recaptcha\"]');

            if (recaptchaFrame) {
                logger.info('🤖 reCAPTCHA detected, attempting to solve...');

                const siteKey = await this.extractSiteKey(page);
                const pageUrl = page.url();

                if (siteKey) {
                    const solution = await captchaSolver.solve('recaptcha', {
                        sitekey: siteKey,
                        pageurl: pageUrl
                    });

                    if (solution) {
                        // Inject solution
                        await page.evaluate((token) => {
                            document.getElementById('g-recaptcha-response').innerHTML = token;
                        }, solution);

                        await this.delay(this.randomDelay(1000, 2000));
                        logger.info('✅ reCAPTCHA solved successfully');
                    } else {
                        throw new Error('Failed to solve reCAPTCHA');
                    }
                } else {
                    throw new Error('Could not extract reCAPTCHA site key');
                }
            }

            // Look for hCaptcha
            const hcaptchaFrame = await page.$('iframe[src*=\"hcaptcha\"]');

            if (hcaptchaFrame) {
                logger.info('🤖 hCaptcha detected, attempting to solve...');

                const siteKey = await this.extractHCaptchaSiteKey(page);
                const pageUrl = page.url();

                if (siteKey) {
                    const solution = await captchaSolver.solve('hcaptcha', {
                        sitekey: siteKey,
                        pageurl: pageUrl
                    });

                    if (solution) {
                        // Inject solution
                        await page.evaluate((token) => {
                            document.querySelector('[name=\"h-captcha-response\"]').value = token;
                        }, solution);

                        await this.delay(this.randomDelay(1000, 2000));
                        logger.info('✅ hCaptcha solved successfully');
                    } else {
                        throw new Error('Failed to solve hCaptcha');
                    }
                } else {
                    throw new Error('Could not extract hCaptcha site key');
                }
            }

        } catch (error) {
            logger.error('Captcha handling error:', error.message);
            // Don't throw error if captcha handling fails - Google might accept without it
        }
    }

    async completeAccountCreation(page, userData) {
        logger.debug('Completing account creation...');

        try {
            // Handle birthday and gender if required
            await this.handlePersonalInfo(page, userData);

            // Accept terms and conditions
            await this.acceptTerms(page);

            // Wait for account creation completion
            await this.waitForAccountCreation(page);

            // Extract account information
            const accountInfo = {
                email: userData.email,
                password: userData.password,
                firstName: userData.firstName,
                lastName: userData.lastName,
                createdAt: new Date().toISOString(),
                verified: false
            };

            // Try to extract additional info from the page
            try {
                const currentUrl = page.url();
                if (currentUrl.includes('myaccount.google.com') || currentUrl.includes('accounts.google.com')) {
                    accountInfo.verified = true;
                }
            } catch (extractError) {
                logger.warn('Could not extract additional account info:', extractError.message);
            }

            return accountInfo;

        } catch (error) {
            logger.error('Failed to complete account creation:', error.message);
            throw error;
        }
    }

    async handlePersonalInfo(page, userData) {
        try {
            // Be resilient: Google may show birthday/gender with varying selectors and sometimes before username
            // Updated selectors for current Google Material Design components
            const monthSelectors = [
                '#month',
                'select#month',
                'select[name=\"month\"]',
                '[aria-label*=\"month\" i]',
                '[role=\"combobox\"][aria-label*=\"month\" i]',
                'div[role=\"button\"][aria-label*=\"month\" i]',
                'input[aria-label*=\"Birth month\" i]',
                'ul[role=\"listbox\"][aria-label*=\"Month\" i]'
            ];
            const daySelectors = [
                '#day',
                'input#day',
                'input[name=\"day\"]',
                '[aria-label*=\"day\" i]',
                'input[aria-label*=\"Birth day\" i]',
                'input[type=\"number\"][aria-label*=\"day\" i]'
            ];
            const yearSelectors = [
                '#year',
                'input#year',
                'input[name=\"year\"]',
                '[aria-label*=\"year\" i]',
                'input[aria-label*=\"Birth year\" i]',
                'input[type=\"number\"][aria-label*=\"year\" i]'
            ];
            const genderSelectors = [
                '#gender',
                'select#gender',
                'select[name=\"gender\"]',
                '[aria-label*=\"gender\" i]',
                '[role=\"combobox\"][aria-label*=\"gender\" i]',
                'div[role=\"button\"][aria-label*=\"gender\" i]'
            ];

            const firstExists = async (sels) => {
                for (const s of sels) {
                    if (await page.$(s)) return s;
                }
                return null;
            };

            const monthSel = await firstExists(monthSelectors);
            const daySel   = await firstExists(daySelectors);
            const yearSel  = await firstExists(yearSelectors);
            logger.debug(`Personal info selector match: month=${monthSel || 'none'}, day=${daySel || 'none'}, year=${yearSel || 'none'}`);
            if (!monthSel && !daySel && !yearSel) {
                await this.captureDebug(page, 'pi-no-fields');
            }

            if (monthSel || daySel || yearSel) {
                logger.debug('📅 Filling personal information...');

                // Helpers for Material-style comboboxes and aria-labeled inputs
                const monthNameFromIndex = (m) => {
                    const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    const idx = Math.max(1, Math.min(12, parseInt(m || 1))) - 1;
                    return names[idx];
                };
                const genderTextFromCode = (g) => {
                    const s = String(g || '3');
                    if (s === '1') return 'Male';
                    if (s === '2') return 'Female';
                    return 'Prefer not to say';
                };
                const selectComboboxByLabel = async (labelText, optionText) => {
                    try {
                        // Open the combobox
                        await page.evaluate((lbl) => {
                            const lower = (x) => (x || '').toLowerCase().trim();
                            const byAria = document.querySelector(`[role="combobox"][aria-label*="${lbl}"]`);
                            const byBtn  = document.querySelector(`div[role="button"][aria-label*="${lbl}"]`);
                            const any = byAria || byBtn ||
                                [...document.querySelectorAll('[role="combobox"],[role="button"]')]
                                  .find(el => lower(el.getAttribute('aria-label')).includes(lower(lbl)));
                            if (any) any.click();
                        }, labelText);
                        await page.waitForTimeout(250);

                        // Pick an option by visible text
                        await page.evaluate((opt) => {
                            const lower = (x) => (x || '').toLowerCase().trim();
                            const list = document.querySelector('[role="listbox"]') || document;
                            const items = [...list.querySelectorAll('[role="option"], li, div')];
                            const cand = items.find(el => lower(el.innerText || el.textContent).includes(lower(opt)));
                            if (cand) (cand.closest('[role="option"]') || cand).click();
                        }, optionText);
                        await page.waitForTimeout(400);
                    } catch (_e) {
                        // swallow
                    }
                };
                const typeByAria = async (labelText, value) => {
                    try {
                        const handle = await page.$(`input[aria-label*="${labelText}" i]`);
                        if (handle) {
                            try { await handle.click({ delay: 30 }); } catch (_e) {}
                            await page.waitForTimeout(120);
                            try { await handle.focus(); } catch (_e2) {}
                            try {
                                await page.keyboard.down('Control');
                                await page.keyboard.press('A');
                                await page.keyboard.up('Control');
                                await page.keyboard.press('Backspace');
                            } catch (_e3) {}
                            await page.keyboard.type(String(value), { delay: 60 });
                            await page.waitForTimeout(180);
                        }
                    } catch (_e) {}
                };

                const tryFill = async (sel, value, isNumeric = true) => {
                    if (!sel || value === undefined || value === null) return;
                    try {
                        // Works for <select>
                        await page.select(sel, String(value));
                    } catch (_e) {
                        // Fallback for inputs
                        try { await page.click(sel, { delay: 40 }); } catch (_e2) {}
                        await this.delay(this.randomDelay(150, 300));
                        try { await page.focus(sel); } catch (_e3) {}
                        try {
                            await page.keyboard.down('Control');
                            await page.keyboard.press('A');
                            await page.keyboard.up('Control');
                            await page.keyboard.press('Backspace');
                        } catch (_e4) {}
                        await this.delay(this.randomDelay(80, 160));
                        await page.keyboard.type(String(value), { delay: 60 });
                        if (isNumeric) {
                            await page.keyboard.press('Enter').catch(() => {});
                        }
                    }
                    await this.delay(this.randomDelay(250, 500));
                };

                // Handle month dropdown specially (Material Design dropdown)
                if (monthSel) {
                    await this.handleMonthDropdown(page, monthSel, userData.birthMonth);
                } else {
                    logger.warn('No month selector found');
                }

                await tryFill(daySel, userData.birthDay);
                await tryFill(yearSel, userData.birthYear);

                const genderSel = await firstExists(genderSelectors);
                if (genderSel) {
                    await tryFill(genderSel, userData.gender || '3', false); // '3' = Prefer not to say
                }

                // Advance if a next/continue button exists
                const nextCandidates = [
                    '[jsname=\"LgbsSe\"]',
                    '#accountDetailsNext',
                    '#birthdaygenderNext',
                    '#personalDetailsNext',
                    'div[role=\"button\"][jsname=\"LgbsSe\"]',
                    'button[type=\"button\"]',
                    'button[type=\"submit\"]'
                ];
                let advanced = false;
                for (const sel of nextCandidates) {
                    const btn = await page.$(sel);
                    if (btn) {
                        await page.click(sel).catch(() => {});
                        await this.delay(this.randomDelay(1500, 3000));
                        advanced = true;
                        break;
                    }
                }
                // Fallback: click by visible text \"Next\"
                if (!advanced) {
                    try {
                        await page.evaluate(() => {
                            const nodes = [...document.querySelectorAll('button,div[role=\"button\"],a')];
                            const el = nodes.find(n => ((n.innerText || n.textContent || '').trim().toLowerCase() === 'next'));
                            if (el) el.click();
                        });
                        // small wait after click
                        return new Promise(r => setTimeout(r, 1500));
                    } catch (_e) {}
                }
            }
        } catch (error) {
            await this.captureDebug(page, 'personal-info-error');
            logger.warn('Personal info handling error:', error?.message || String(error));
            // Continue even if personal info fails
        }
    }

    async handleMonthDropdown(page, monthSelector, monthValue) {
        try {
            logger.debug('📅 Handling month dropdown with Material Design...');

            // Get month name from number (1-12)
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];

            const monthIndex = parseInt(monthValue) || 1;
            const monthName = monthNames[Math.max(1, Math.min(12, monthIndex)) - 1];

            logger.debug(`Selecting month: ${monthName} (${monthValue})`);

            // First try traditional select
            try {
                await page.select(monthSelector, String(monthValue));
                logger.debug('✅ Month selected using traditional select');
                return;
            } catch (selectError) {
                logger.debug('Traditional select failed, trying Material Design approach...');
            }

            // Check if dropdown is already open (options visible)
            const optionsAlreadyVisible = await page.$('li[role="option"][data-value]');

            if (!optionsAlreadyVisible) {
                // Click to open dropdown if not already open
                await page.click(monthSelector);
                await this.delay(this.randomDelay(500, 1000));
            } else {
                logger.debug('Month dropdown options already visible');
            }

            // Wait for dropdown options to appear
            const optionSelectors = [
                '[role="option"]',
                '[role="listbox"] [role="option"]',
                'li[role="option"]',
                'li[data-value]',
                'div[data-value]',
                'ul[role="listbox"] li[role="option"]'
            ];

            let optionSelected = false;

            for (const optionSelector of optionSelectors) {
                try {
                    await page.waitForSelector(optionSelector, { timeout: 2000 });

                    // Try to select by month name
                    const selected = await page.evaluate((selector, monthName, monthValue) => {
                        const options = Array.from(document.querySelectorAll(selector));

                        // Try to find by text content (month name)
                        let target = options.find(el => {
                            const text = (el.textContent || '').trim().toLowerCase();
                            return text === monthName.toLowerCase() || text.includes(monthName.toLowerCase());
                        });

                        // If not found, try by data-value or value attribute
                        if (!target) {
                            target = options.find(el => {
                                const value = el.getAttribute('data-value') || el.getAttribute('value');
                                return value == monthValue;
                            });
                        }

                        // If still not found, try by index (monthValue - 1)
                        if (!target && options.length >= 12) {
                            const index = parseInt(monthValue) - 1;
                            if (index >= 0 && index < options.length) {
                                target = options[index];
                            }
                        }

                        if (target) {
                            target.click();
                            return true;
                        }
                        return false;
                    }, optionSelector, monthName, monthValue);

                    if (selected) {
                        logger.debug(`✅ Month selected using ${optionSelector}`);
                        optionSelected = true;
                        await this.delay(this.randomDelay(300, 600));
                        break;
                    }
                } catch (waitError) {
                    continue;
                }
            }

            if (!optionSelected) {
                logger.warn('❌ Could not select month from dropdown');
                // Try clicking away to close dropdown
                await page.click('body');
            }

        } catch (error) {
            logger.warn('Month dropdown handling error:', error.message);
        }
    }

    async acceptTerms(page) {
        try {
            logger.debug('📋 Accepting terms and conditions...');

            // Look for accept button
            const acceptSelectors = [
                '[jsname=\"LgbsSe\"]',
                'button[type=\"button\"]',
                '[data-is-touch-wrapper=\"true\"] button'
            ];

            for (const selector of acceptSelectors) {
                const button = await page.$(selector);
                if (button) {
                    const buttonText = await page.$eval(selector, el => el.textContent?.toLowerCase() || '');
                    if (buttonText.includes('accept') || buttonText.includes('agree') || buttonText.includes('create')) {
                        await page.click(selector);
                        await this.delay(this.randomDelay(2000, 4000));
                        logger.debug('✅ Terms accepted');
                        break;
                    }
                }
            }

        } catch (error) {
            logger.warn('Terms acceptance error:', error.message);
            // Continue even if terms acceptance fails
        }
    }

    async waitForAccountCreation(page) {
        logger.debug('⏳ Waiting for account creation to complete...');

        try {
            // Wait for successful account creation indicators
            await Promise.race([
                page.waitForFunction(() => /myaccount\.google\.com/.test(location.href), { timeout: 30000 }),
                page.waitForFunction(() => /accounts\.google\.com\/ManageAccount/.test(location.href), { timeout: 30000 }),
                page.waitForSelector('[data-email]', { timeout: 30000 })
            ]);

            logger.info('✅ Account creation completed successfully');

        } catch (error) {
            logger.warn('Could not detect account creation completion:', error.message);
            // Continue anyway - the account might have been created
        }
    }

    async extractSiteKey(page) {
        try {
            return await page.evaluate(() => {
                const recaptchaElement = document.querySelector('[data-sitekey]');
                return recaptchaElement ? recaptchaElement.getAttribute('data-sitekey') : null;
            });
        } catch (error) {
            logger.error('Failed to extract reCAPTCHA site key:', error.message);
            return null;
        }
    }

    async extractHCaptchaSiteKey(page) {
        try {
            return await page.evaluate(() => {
                const hcaptchaElement = document.querySelector('[data-sitekey]');
                return hcaptchaElement ? hcaptchaElement.getAttribute('data-sitekey') : null;
            });
        } catch (error) {
            logger.error('Failed to extract hCaptcha site key:', error.message);
            return null;
        }
    }

    async typeHumanLike(page, target, text) {
        // Ensure text is a string
        if (typeof text !== 'string') {
            text = String(text || '');
        }
        
        // Support both CSS selector strings and ElementHandle objects
        if (typeof target === 'string') {
            // Existing behavior for CSS selectors
            await page.focus(target);
            await this.delay(this.randomDelay(100, 300));

            for (const char of text) {
                await page.keyboard.type(char);
                await this.delay(this.randomDelay(50, 200));
            }
        } else if (target && typeof target.click === 'function') {
            // Handle ElementHandle objects
            await target.click();
            await this.delay(this.randomDelay(100, 300));
            await target.focus();
            await this.delay(this.randomDelay(100, 300));

            for (const char of text) {
                await page.keyboard.type(char);
                await this.delay(this.randomDelay(50, 200));
            }
        } else {
            throw new Error('Invalid target type for typeHumanLike. Expected string or ElementHandle.');
        }
    }

    async captureDebug(page, label = 'debug') {
        try {
            const dir = (settings.paths && settings.paths.screenshots) || './temp/screenshots';
            fs.ensureDirSync(dir);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeLabel = String(label).replace(/[^a-z0-9\-_]/gi, '_');
            const base = path.join(dir, `${timestamp}-${safeLabel}`);

            // Enhanced debug capture with comprehensive information
            try {
                await page.screenshot({ path: `${base}.png`, fullPage: true });
            } catch (e) {
                logger.warn('Screenshot capture failed:', e.message);
            }

            try {
                const html = await page.content();
                await fs.writeFile(`${base}.html`, html, 'utf8');
            } catch (e) {
                logger.warn('HTML capture failed:', e.message);
            }

            // Capture additional debug information
            try {
                const debugInfo = {
                    url: page.url(),
                    title: await page.title(),
                    timestamp: new Date().toISOString(),
                    visibleText: await page.evaluate(() => document.body.innerText.substring(0, 1000)),
                    inputFields: await page.evaluate(() => {
                        return Array.from(document.querySelectorAll('input')).map(input => ({
                            name: input.name,
                            type: input.type,
                            id: input.id,
                            ariaLabel: input.getAttribute('aria-label'),
                            placeholder: input.placeholder,
                            visible: input.offsetParent !== null
                        }));
                    }),
                    buttons: await page.evaluate(() => {
                        return Array.from(document.querySelectorAll('button, [role=\"button\"]')).map(btn => ({
                            text: btn.innerText || btn.textContent,
                            ariaLabel: btn.getAttribute('aria-label'),
                            jsname: btn.getAttribute('jsname'),
                            visible: btn.offsetParent !== null
                        }));
                    })
                };
                await fs.writeFile(`${base}-debug.json`, JSON.stringify(debugInfo, null, 2), 'utf8');
            } catch (e) {
                logger.warn('Extended debug info capture failed:', e.message);
            }

            logger.info(`🧩 Debug captured: ${base} url=${page.url()}`);
        } catch (e) {
            logger.warn('Debug capture error:', e.message);
        }
    }

    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    calculateRetryDelay(retryCount) {
        // Exponential backoff with jitter
        const baseDelay = 5000;
        const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
        const jitter = Math.random() * 2000;
        return Math.min(exponentialDelay + jitter, 60000); // Max 60 seconds
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = GoogleAccount;