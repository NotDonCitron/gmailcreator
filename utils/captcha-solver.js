const axios = require('axios');
const logger = require('./logger');

class CaptchaSolver {
    constructor() {
        this.service = process.env.CAPTCHA_SERVICE || '2captcha';
        this.apiKey = process.env.TWOCAPTCHA_API_KEY;
        this.timeout = parseInt(process.env.CAPTCHA_TIMEOUT) || 120;
        this.pollInterval = 5000;
        this.maxRetries = 3;

        // Service configurations
        this.services = {
            '2captcha': {
                baseUrl: 'http://2captcha.com',
                submitEndpoint: '/in.php',
                resultEndpoint: '/res.php'
            }
        };

        if (!this.apiKey) {
            logger.warn('⚠️  No captcha API key provided. Captcha solving will be disabled.');
        } else {
            logger.info('🤖 Captcha solver initialized with service:', this.service);
        }
    }

    async solve(captchaType, options = {}) {
        if (!this.apiKey) {
            logger.warn('Captcha solving requested but no API key configured');
            return null;
        }

        logger.info(`🔍 Solving ${captchaType} captcha...`);

        try {
            const startTime = Date.now();
            let solution = null;

            switch (captchaType.toLowerCase()) {
                case 'recaptcha':
                case 'recaptcha_v2':
                    solution = await this.solveRecaptcha(options);
                    break;
                case 'recaptcha_v3':
                    solution = await this.solveRecaptchaV3(options);
                    break;
                case 'hcaptcha':
                    solution = await this.solveHCaptcha(options);
                    break;
                case 'image':
                    solution = await this.solveImageCaptcha(options);
                    break;
                default:
                    throw new Error(`Unsupported captcha type: ${captchaType}`);
            }

            const solveTime = Date.now() - startTime;

            if (solution) {
                logger.captchaSolved(captchaType, options.sitekey, solveTime);
                return solution;
            } else {
                logger.error('❌ Failed to solve captcha: No solution returned');
                return null;
            }

        } catch (error) {
            logger.error('❌ Captcha solving error:', error);
            return null;
        }
    }

    async solveRecaptcha(options) {
        const { sitekey, pageurl, invisible = false } = options;

        if (!sitekey || !pageurl) {
            throw new Error('Missing required parameters: sitekey and pageurl');
        }

        logger.debug('Solving reCAPTCHA v2...', { sitekey: sitekey.substring(0, 20) + '...', pageurl });

        const submitData = {
            method: 'userrecaptcha',
            googlekey: sitekey,
            pageurl: pageurl,
            key: this.apiKey,
            json: 1
        };

        if (invisible) {
            submitData.invisible = 1;
        }

        return await this.submitAndWait(submitData);
    }

    async solveRecaptchaV3(options) {
        const { sitekey, pageurl, action = 'verify', min_score = 0.3 } = options;

        if (!sitekey || !pageurl) {
            throw new Error('Missing required parameters: sitekey and pageurl');
        }

        logger.debug('Solving reCAPTCHA v3...', { sitekey: sitekey.substring(0, 20) + '...', pageurl, action });

        const submitData = {
            method: 'userrecaptcha',
            version: 'v3',
            googlekey: sitekey,
            pageurl: pageurl,
            action: action,
            min_score: min_score,
            key: this.apiKey,
            json: 1
        };

        return await this.submitAndWait(submitData);
    }

    async solveHCaptcha(options) {
        const { sitekey, pageurl } = options;

        if (!sitekey || !pageurl) {
            throw new Error('Missing required parameters: sitekey and pageurl');
        }

        logger.debug('Solving hCaptcha...', { sitekey: sitekey.substring(0, 20) + '...', pageurl });

        const submitData = {
            method: 'hcaptcha',
            sitekey: sitekey,
            pageurl: pageurl,
            key: this.apiKey,
            json: 1
        };

        return await this.submitAndWait(submitData);
    }

    async solveImageCaptcha(options) {
        const { image, instructions = '' } = options;

        if (!image) {
            throw new Error('Missing required parameter: image');
        }

        logger.debug('Solving image captcha...', { instructions });

        const submitData = {
            method: 'base64',
            body: image,
            key: this.apiKey,
            json: 1
        };

        if (instructions) {
            submitData.textinstructions = instructions;
        }

        return await this.submitAndWait(submitData);
    }

    async submitAndWait(submitData) {
        let retryCount = 0;

        while (retryCount < this.maxRetries) {
            try {
                // Submit captcha
                logger.debug('Submitting captcha to solving service...');
                const taskId = await this.submitCaptcha(submitData);

                if (!taskId) {
                    throw new Error('No task ID returned from captcha service');
                }

                logger.debug(`Captcha submitted successfully. Task ID: ${taskId}`);

                // Wait for solution
                const solution = await this.waitForSolution(taskId);

                if (solution) {
                    logger.info('✅ Captcha solved successfully');
                    return solution;
                } else {
                    throw new Error('No solution returned');
                }

            } catch (error) {
                retryCount++;
                logger.warn(`Captcha solving attempt ${retryCount}/${this.maxRetries} failed:`, error.message);

                if (retryCount >= this.maxRetries) {
                    throw error;
                }

                // Wait before retry
                await this.delay(this.pollInterval);
            }
        }
    }

    async submitCaptcha(submitData) {
        const config = this.services[this.service];
        const url = config.baseUrl + config.submitEndpoint;

        try {
            // URL-encode the form data
            const formData = new URLSearchParams();
            Object.keys(submitData).forEach(key => {
                formData.append(key, submitData[key]);
            });

            const response = await axios.post(url, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            });

            // Handle both JSON and plain text responses
            const responseData = typeof response.data === 'string' ?
                this.parseResponse(response.data) : response.data;

            if (responseData.status === 1) {
                return responseData.request;
            } else {
                const errorText = responseData.error_text || responseData.request || 'Unknown error';
                throw new Error(`Captcha submission failed: ${errorText}`);
            }

        } catch (error) {
            if (error.response) {
                const responseData = typeof error.response.data === 'string' ?
                    this.parseResponse(error.response.data) : error.response.data;
                const errorText = responseData?.error_text || responseData?.request || error.response.statusText;
                throw new Error(`HTTP ${error.response.status}: ${errorText}`);
            } else {
                throw error;
            }
        }
    }

    async waitForSolution(taskId) {
        const config = this.services[this.service];
        const url = config.baseUrl + config.resultEndpoint;

        const startTime = Date.now();
        const timeoutMs = this.timeout * 1000;

        logger.debug(`Waiting for captcha solution (timeout: ${this.timeout}s)...`);

        while ((Date.now() - startTime) < timeoutMs) {
            try {
                const response = await axios.get(url, {
                    params: {
                        key: this.apiKey,
                        action: 'get',
                        id: taskId,
                        json: 1
                    },
                    timeout: 10000
                });

                // Handle both JSON and plain text responses
                const responseData = typeof response.data === 'string' ?
                    this.parseResponse(response.data) : response.data;

                if (responseData.status === 1) {
                    // Solution ready
                    return responseData.request;
                } else if (responseData.error_text || responseData.request === 'CAPCHA_NOT_READY') {
                    if (responseData.request === 'CAPCHA_NOT_READY') {
                        // Still processing, wait and try again
                        logger.debug('Captcha still being processed...');
                        await this.delay(this.pollInterval);
                    } else {
                        throw new Error(`Captcha solving error: ${responseData.error_text}`);
                    }
                } else {
                    // Still processing, wait and try again
                    logger.debug('Captcha still being processed...');
                    await this.delay(this.pollInterval);
                }

            } catch (error) {
                if (error.message.includes('CAPCHA_NOT_READY')) {
                    // Still processing
                    await this.delay(this.pollInterval);
                    continue;
                } else {
                    throw error;
                }
            }
        }

        throw new Error('Captcha solving timeout exceeded');
    }

    async getBalance() {
        if (!this.apiKey) {
            return { balance: 0, currency: 'USD', error: 'No API key configured' };
        }

        try {
            const config = this.services[this.service];
            const url = config.baseUrl + config.resultEndpoint;

            const response = await axios.get(url, {
                params: {
                    key: this.apiKey,
                    action: 'getbalance',
                    json: 1
                },
                timeout: 10000
            });

            if (response.data.status === 1) {
                const balance = parseFloat(response.data.request);
                logger.debug(`Captcha service balance: $${balance.toFixed(2)}`);
                return { balance, currency: 'USD' };
            } else {
                throw new Error(response.data.error_text || 'Failed to get balance');
            }

        } catch (error) {
            logger.error('Failed to get captcha service balance:', error.message);
            return { balance: 0, currency: 'USD', error: error.message };
        }
    }

    async reportBad(captchaId) {
        if (!this.apiKey || !captchaId) {
            return false;
        }

        try {
            const config = this.services[this.service];
            const url = config.baseUrl + config.resultEndpoint;

            const response = await axios.get(url, {
                params: {
                    key: this.apiKey,
                    action: 'reportbad',
                    id: captchaId,
                    json: 1
                },
                timeout: 10000
            });

            if (response.data.status === 1) {
                logger.debug(`Reported bad captcha: ${captchaId}`);
                return true;
            } else {
                logger.warn(`Failed to report bad captcha: ${response.data.error_text}`);
                return false;
            }

        } catch (error) {
            logger.error('Error reporting bad captcha:', error.message);
            return false;
        }
    }

    async reportGood(captchaId) {
        if (!this.apiKey || !captchaId) {
            return false;
        }

        try {
            const config = this.services[this.service];
            const url = config.baseUrl + config.resultEndpoint;

            const response = await axios.get(url, {
                params: {
                    key: this.apiKey,
                    action: 'reportgood',
                    id: captchaId,
                    json: 1
                },
                timeout: 10000
            });

            if (response.data.status === 1) {
                logger.debug(`Reported good captcha: ${captchaId}`);
                return true;
            } else {
                logger.warn(`Failed to report good captcha: ${response.data.error_text}`);
                return false;
            }

        } catch (error) {
            logger.error('Error reporting good captcha:', error.message);
            return false;
        }
    }

    async testConnection() {
        logger.info('🔍 Testing captcha service connection...');

        try {
            const balance = await this.getBalance();

            if (balance.error) {
                throw new Error(balance.error);
            }

            logger.info(`✅ Captcha service connection successful. Balance: $${balance.balance.toFixed(2)}`);

            if (balance.balance < 1) {
                logger.warn('⚠️  Low captcha service balance. Consider adding funds.');
            }

            return true;

        } catch (error) {
            logger.error('❌ Captcha service connection failed:', error.message);
            return false;
        }
    }

    isEnabled() {
        return !!(this.apiKey && this.service);
    }

    getServiceInfo() {
        return {
            service: this.service,
            enabled: this.isEnabled(),
            timeout: this.timeout,
            pollInterval: this.pollInterval,
            maxRetries: this.maxRetries
        };
    }

    // Utility method for delays
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Method to capture screenshot for image captchas
    async captureImageCaptcha(page, selector) {
        try {
            logger.debug('Capturing image captcha screenshot...');

            const element = await page.$(selector);
            if (!element) {
                throw new Error('Captcha element not found');
            }

            const screenshot = await element.screenshot({ encoding: 'base64' });
            logger.debug('Image captcha screenshot captured successfully');

            return screenshot;

        } catch (error) {
            logger.error('Failed to capture image captcha:', error.message);
            throw error;
        }
    }

    // Method to extract site key from page
    async extractSiteKey(page, captchaType = 'recaptcha') {
        try {
            logger.debug(`Extracting ${captchaType} site key from page...`);

            let siteKey = null;

            if (captchaType === 'recaptcha') {
                siteKey = await page.evaluate(() => {
                    const recaptchaElement = document.querySelector('[data-sitekey]');
                    return recaptchaElement ? recaptchaElement.getAttribute('data-sitekey') : null;
                });
            } else if (captchaType === 'hcaptcha') {
                siteKey = await page.evaluate(() => {
                    const hcaptchaElement = document.querySelector('[data-sitekey]');
                    return hcaptchaElement ? hcaptchaElement.getAttribute('data-sitekey') : null;
                });
            }

            if (siteKey) {
                logger.debug(`${captchaType} site key extracted: ${siteKey.substring(0, 20)}...`);
                return siteKey;
            } else {
                throw new Error(`No ${captchaType} site key found on page`);
            }

        } catch (error) {
            logger.error(`Failed to extract ${captchaType} site key:`, error.message);
            return null;
        }
    }

    // Method to inject captcha solution into page
    async injectSolution(page, solution, captchaType = 'recaptcha') {
        try {
            logger.debug(`Injecting ${captchaType} solution into page...`);

            if (captchaType === 'recaptcha') {
                await page.evaluate((token) => {
                    const responseElement = document.getElementById('g-recaptcha-response');
                    if (responseElement) {
                        responseElement.innerHTML = token;
                        responseElement.value = token;
                    }

                    // Trigger callback if available
                    if (typeof window.grecaptcha !== 'undefined' && window.grecaptcha.getResponse) {
                        window.grecaptcha.getResponse = () => token;
                    }
                }, solution);

            } else if (captchaType === 'hcaptcha') {
                await page.evaluate((token) => {
                    const responseElement = document.querySelector('[name=\"h-captcha-response\"]');
                    if (responseElement) {
                        responseElement.value = token;
                    }

                    // Trigger callback if available
                    if (typeof window.hcaptcha !== 'undefined' && window.hcaptcha.getResponse) {
                        window.hcaptcha.getResponse = () => token;
                    }
                }, solution);
            }

            logger.debug(`${captchaType} solution injected successfully`);

        } catch (error) {
            logger.error(`Failed to inject ${captchaType} solution:`, error.message);
            throw error;
        }
    }

    // Utility method to parse 2captcha responses
    parseResponse(responseText) {
        try {
            // Try to parse as JSON first
            return JSON.parse(responseText);
        } catch (e) {
            // If not JSON, parse as pipe-separated values
            if (responseText.includes('|')) {
                const parts = responseText.split('|');
                if (parts[0] === 'OK') {
                    return { status: 1, request: parts[1] };
                } else if (parts[0] === 'ERROR') {
                    return { status: 0, error_text: parts[1] };
                }
            }

            // Handle simple status responses
            if (responseText === 'CAPCHA_NOT_READY') {
                return { status: 0, request: 'CAPCHA_NOT_READY' };
            }

            if (responseText.startsWith('ERROR_')) {
                return { status: 0, error_text: responseText };
            }

            if (responseText.startsWith('OK|')) {
                return { status: 1, request: responseText.substring(3) };
            }

            // Default fallback
            return { status: 0, request: responseText };
        }
    }
}

module.exports = CaptchaSolver;