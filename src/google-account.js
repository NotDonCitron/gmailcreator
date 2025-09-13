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

    async create(browser, userData) {
        let page = null;
        let retryCount = 0;

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
                    throw new Error(`Failed to create Google account after ${this.maxRetries} attempts: ${error.message}`);
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
        await page.waitForSelector('#firstName', { timeout: 15000 });

        // Fill first and last name
        await this.typeHumanLike(page, '#firstName', userData.firstName);
        await this.delay(this.randomDelay(400, 900));
        await this.typeHumanLike(page, '#lastName', userData.lastName);
        await this.delay(this.randomDelay(400, 900));

        // Try to locate a username field on this step; flows vary by region/UI
        const usernameCandidates = [
            '#username',
            'input[name="Username"]',
            'input[name="username"]',
            'input[type="email"][name="Username"]',
            'input[type="email"][name="username"]',
            'input[aria-label*="username" i]',
            'input[aria-label*="gmail address" i]'
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
            // Some flows require clicking a generic "Next" after name to reach username/password page
            logger.debug('Username field not present on current step, attempting to advance...');
            const possibleNexts = [
                '#collectNameNext',
                '#accountDetailsNext',
                'button[jsname="LgbsSe"]',
                'div[role="button"][jsname="LgbsSe"]'
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

            // In some UIs there is a link to toggle Gmail vs current email; try to reveal Gmail username
            try {
                await page.evaluate(() => {
                    const nodes = [...document.querySelectorAll('a,button,div[role="button"]')];
                    const btnOrLink = nodes.find(el => {
                        const t = (el.innerText || el.textContent || '').toLowerCase().trim();
                        return (
                            t.includes('create your own gmail address') ||
                            t.includes('create a gmail address') ||
                            t.includes('create your gmail address') ||
                            t.includes('gmail address instead') ||
                            t.includes('use a gmail address') ||
                            t.includes('use a gmail address instead')
                        );
                    });
                    if (btnOrLink) btnOrLink.click();
                });
                await this.delay(this.randomDelay(800, 1500));
            } catch (_e) {}

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

            // Try to advance again and wait for username
            try {
                await page.click('button[jsname="LgbsSe"]');
                await this.delay(this.randomDelay(1500, 3000));
            } catch (_e) {}

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
            } catch (_e) {}
            throw new Error('Username field not found after navigating flow');
        }

        // Fill username (local-part only)
        const localPart = userData.email.split('@')[0];
        await this.typeHumanLike(page, usernameSelectorFound, localPart);
        await this.delay(this.randomDelay(400, 900));

        // Fill password fields (selectors can vary slightly; check a couple of candidates)
        const pwdCandidates = ['[name="Passwd"]', 'input[name="Passwd"]', 'input[type="password"][name="Passwd"]'];
        const confirmCandidates = ['[name="ConfirmPasswd"]', 'input[name="ConfirmPasswd"]', 'input[type="password"][name="ConfirmPasswd"]'];

        let pwdSel = null;
        for (const sel of pwdCandidates) {
            if (await page.$(sel)) { pwdSel = sel; break; }
        }
        let confirmSel = null;
        for (const sel of confirmCandidates) {
            if (await page.$(sel)) { confirmSel = sel; break; }
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

        if (!pwdSel || !confirmSel) {
            throw new Error('Password fields not found in flow');
        }

        await this.typeHumanLike(page, pwdSel, userData.password);
        await this.delay(this.randomDelay(400, 900));
        await this.typeHumanLike(page, confirmSel, userData.password);
        await this.delay(this.randomDelay(800, 1500));

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
            const monthSelectors = ['#month', 'select#month', 'select[name=\"month\"]', '[aria-label*=\"month\" i]'];
            const daySelectors   = ['#day', 'input#day', 'input[name=\"day\"]', '[aria-label*=\"day\" i]'];
            const yearSelectors  = ['#year', 'input#year', 'input[name=\"year\"]', '[aria-label*=\"year\" i]'];
            const genderSelectors= ['#gender', 'select#gender', 'select[name=\"gender\"]', '[aria-label*=\"gender\" i]'];

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
                // Helpers for Material UI dropdowns (combobox) and label-based inputs
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
                        await page.evaluate((lbl, opt) => {
                            const lower = (x) => (x || '').toLowerCase().trim();
                            // Find combobox by aria-label containing label text
                            const cb = document.querySelector(`[role=\"combobox\"][aria-label*=\"${lbl}\"]`) ||
                                       document.querySelector(`div[role=\"button\"][aria-label*=\"${lbl}\"]`) ||
                                       [...document.querySelectorAll('[role=\"combobox\"],[role=\"button\"]')].find(el => lower(el.getAttribute('aria-label')).includes(lower(lbl)));
                            if (cb) cb.click();
                        }, labelText, optionText);
                        await this.delay(this.randomDelay(200, 500));
                        // Click option by visible text
                        await page.evaluate((opt) => {
                            const lower = (x) => (x || '').toLowerCase().trim();
                            const list = document.querySelector('[role=\"listbox\"],ul[role=\"listbox\"],div[role=\"listbox\"]') || document;
                            const all = [...list.querySelectorAll('[role=\"option\"], li, div')];
                            const cand = all.find(el => lower(el.innerText || el.textContent).includes(lower(opt)));
                            if (cand) (cand.closest('[role=\"option\"]') || cand).click();
                        }, optionText);
                        await this.delay(this.randomDelay(300, 700));
                    } catch (_e) {
                        // Swallow errors; fallback typing may still succeed
                    }
                };
                const typeByAria = async (labelText, value) => {
                    try {
                        const handle = await page.$(`input[aria-label*=\"${labelText}\" i]`);
                        if (handle) {
                            try { await handle.click({ delay: 30 }); } catch (_e) {}
                            await this.delay(this.randomDelay(80, 160));
                            try { await handle.focus(); } catch (_e2) {}
                            try {
                                await page.keyboard.down('Control');
                                await page.keyboard.press('A');
                                await page.keyboard.up('Control');
                                await page.keyboard.press('Backspace');
                            } catch (_e3) {}
                            await page.keyboard.type(String(value), { delay: 60 });
                            await this.delay(this.randomDelay(150, 300));
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

                await tryFill(monthSel, userData.birthMonth);
                await tryFill(daySel,   userData.birthDay);
                await tryFill(yearSel,  userData.birthYear);

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

    async typeHumanLike(page, selector, text) {
        await page.focus(selector);
        await this.delay(this.randomDelay(100, 300));

        for (const char of text) {
            await page.keyboard.type(char);
            await this.delay(this.randomDelay(50, 200));
        }
    }

    async captureDebug(page, label = 'debug') {
        try {
            const dir = (settings.paths && settings.paths.screenshots) || './temp/screenshots';
            fs.ensureDirSync(dir);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeLabel = String(label).replace(/[^a-z0-9\-_]/gi, '_');
            const base = path.join(dir, `${timestamp}-${safeLabel}`);
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