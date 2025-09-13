#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

const DolphinAnty = require('./dolphin-anty');
const GoogleAccount = require('./google-account');
const KilocodeRegistration = require('./kilocode-registration');
const StealthBrowser = require('./stealth-browser');
const DataGenerator = require('./data-generator');
const ProxyManager = require('../config/proxies');

const logger = require('../utils/logger');
const errorHandler = require('../utils/error-handler');
const settings = require('../config/settings');

class KilocodeAutomation {
    constructor(options = {}) {
        this.options = {
            mode: 'production',
            batchSize: 1,
            concurrentInstances: 1,
            headless: true,
            debug: false,
            ...options
        };

        this.dolphinAnty = new DolphinAnty();
        this.googleAccount = new GoogleAccount();
        this.kilocodeRegistration = new KilocodeRegistration();
        this.stealthBrowser = new StealthBrowser();
        this.dataGenerator = new DataGenerator();
        this.proxyManager = new ProxyManager();

        this.stats = {
            attempted: 0,
            successful: 0,
            failed: 0,
            startTime: Date.now()
        };
    }

    async init() {
        try {
            // Create necessary directories
            await fs.ensureDir(path.join(__dirname, '../logs'));
            await fs.ensureDir(path.join(__dirname, '../temp'));
            await fs.ensureDir(path.join(__dirname, '../temp/profiles'));
            await fs.ensureDir(path.join(__dirname, '../temp/screenshots'));

            logger.info('🚀 Kilocode Automation System initialized');
            logger.info(`Mode: ${this.options.mode}`);
            logger.info(`Batch size: ${this.options.batchSize}`);
            logger.info(`Concurrent instances: ${this.options.concurrentInstances}`);
            logger.info(`Headless: ${this.options.headless}`);

            if (this.options.mode === 'test') {
                logger.warn('⚠️  Running in TEST mode - no actual registrations will be performed');
            }

        } catch (error) {
            logger.error('Failed to initialize automation system:', error);
            process.exit(1);
        }
    }

    async runSingleRegistration(overrideOpts = {}) {
        const startTime = Date.now();
        const registrationId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const opts = { ...this.options, ...overrideOpts };

        let profileId = null;
        let browser = null;
        let proxy = null;
        let browserLaunched = false;

        try {
            this.stats.attempted++;
            logger.info(`🎯 Starting registration ${registrationId} (${this.stats.attempted}/${this.options.batchSize})`);

            // Step 1: Get working proxy
            logger.info('🌐 Getting working proxy...');
            proxy = await this.proxyManager.getWorkingProxy();
            logger.info(`Using proxy session ${proxy.sessionId}: ${proxy.host}:${proxy.port}${proxy.ip ? ` (IP: ${proxy.ip})` : ''}`);

            // Step 2: Generate user data
            logger.info('📊 Generating user data...');
            const userData = await this.dataGenerator.generateUserData();
            logger.debug('Generated user data:', { ...userData, password: '[HIDDEN]' });

            // Step 3: Optionally create Dolphin Anty profile
            const antyConfigured = !!(process.env.DOLPHIN_ANTY_TOKEN && process.env.DOLPHIN_ANTY_HOST);
            if (antyConfigured) {
                try {
                    logger.info('🐬 Creating Dolphin Anty profile...');
                    profileId = await this.dolphinAnty.createProfile({
                        name: `kilocode_${registrationId}`,
                        userData,
                        proxy: {
                            type: proxy.type,
                            host: proxy.host,
                            port: proxy.port,
                            username: proxy.username,
                            password: proxy.password
                        }
                    });
                    logger.info(`Profile created: ${profileId}`);
                } catch (e) {
                    logger.warn(`Dolphin Anty profile creation failed: ${e.message}. Falling back to regular stealth launch.`);
                    profileId = null;
                }
            } else {
                logger.warn('Dolphin Anty not configured. Using regular stealth launch.');
            }

            // Step 4: Launch stealth browser (Anty or regular)
            logger.info('🕵️ Launching stealth browser...');
            browser = await this.stealthBrowser.launch(profileId, {
                headless: opts.headless,
                debug: opts.debug,
                proxy
            });
            browserLaunched = true;
            if (logger.browserLaunched) logger.browserLaunched(profileId);

            // Dry-run or fully skipped path
            if (opts.dryRun === true || (opts.skipAccountCreation && opts.skipKilocodeRegistration)) {
                if (browser) {
                    await browser.close();
                    if (this.stealthBrowser.cleanupProxy) {
                        await this.stealthBrowser.cleanupProxy();
                    }
                    if (logger.browserClosed) logger.browserClosed(profileId);
                }
                if (profileId) {
                    await this.dolphinAnty.deleteProfile(profileId);
                }
                const duration = Date.now() - startTime;
                return {
                    status: 'dry_run_completed',
                    duration,
                    profileCreated: !!profileId,
                    browserLaunched: true
                };
            }

            // Step 5: Create Google account (unless skipped)
            let googleAccount = null;
            if (!opts.skipAccountCreation) {
                logger.info('📧 Creating Google account...');
                googleAccount = await this.googleAccount.create(browser, userData);
                logger.info(`Google account created: ${googleAccount.email}`);
            }

            // Step 6: Kilocode registration and bonuses (unless skipped)
            let kilocodeAccount = null;
            let bonuses = [];
            if (!opts.skipKilocodeRegistration) {
                logger.info('🔐 Registering on Kilocode...');
                kilocodeAccount = await this.kilocodeRegistration.register(browser, googleAccount);
                logger.info(`Kilocode registration status: ${kilocodeAccount.status || 'unknown'}`);

                logger.info('💰 Collecting startup bonuses...');
                bonuses = await this.kilocodeRegistration.collectBonuses(browser);
                logger.info(`Bonuses collected: ${JSON.stringify(bonuses)}`);
            }

            // Success
            this.stats.successful++;
            const duration = Date.now() - startTime;
            const result = {
                status: 'completed',
                duration,
                data: {
                    registrationId,
                    userData: { ...userData, password: '[HIDDEN]' },
                    googleAccount,
                    kilocodeAccount,
                    bonuses,
                    profileId,
                    proxy: { sessionId: proxy.sessionId, ip: proxy.ip || null },
                    timestamp: new Date().toISOString()
                }
            };

            // Persist
            await this.saveRegistrationData(result.data);
            logger.info(`✅ Registration ${registrationId} completed successfully!`);

            return result;

        } catch (error) {
            this.stats.failed++;
            logger.error(`❌ Registration ${registrationId} failed:`, error.message);

            if (this.options.debug) {
                await this.captureDebugInfo(browser, registrationId, error);
            }

            const recovery = await errorHandler.handleError(error, registrationId);

            return {
                status: 'failed',
                error: error.message,
                shouldRetry: recovery.shouldRetry,
                timestamp: new Date().toISOString()
            };

        } finally {
            try {
                if (browser) {
                    logger.debug('🧹 Closing browser...');
                    await browser.close();

                    if (this.stealthBrowser.cleanupProxy) {
                        await this.stealthBrowser.cleanupProxy();
                    }
                    if (logger.browserClosed) logger.browserClosed(profileId);
                }

                if (profileId) {
                    logger.debug('🧹 Cleaning up Dolphin Anty profile...');
                    await this.dolphinAnty.deleteProfile(profileId);
                }

            } catch (cleanupError) {
                logger.warn('Warning during cleanup:', cleanupError.message);
            }
        }
    }

    async runBatch() {
        logger.info(`🎯 Starting batch of ${this.options.batchSize} registrations`);

        const results = [];
        const startTime = Date.now();

        if (this.options.concurrentInstances > 1) {
            // Run concurrent registrations
            return await this.runConcurrentBatch();
        }

        // Run registrations sequentially
        for (let i = 0; i < this.options.batchSize; i++) {
            try {
                const result = await this.runSingleRegistration();
                results.push(result);

                // Add delay between registrations to avoid rate limiting
                if (i < this.options.batchSize - 1) {
                    const delay = settings.automation.delayBetweenRegistrations;
                    logger.info(`⏳ Waiting ${delay / 1000}s before next registration...`);
                    await this.delay(delay);
                }

            } catch (error) {
                logger.error(`Fatal error in registration ${i + 1}:`, error);
                results.push({
                    status: 'failed',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return this.generateBatchSummary(results, startTime);
    }

    async runConcurrentBatch() {
        logger.info(`🚀 Running ${this.options.concurrentInstances} concurrent registrations`);

        const results = [];
        const startTime = Date.now();
        const concurrency = Math.min(this.options.concurrentInstances, this.options.batchSize);

        for (let i = 0; i < this.options.batchSize; i += concurrency) {
            const batch = [];
            const batchEnd = Math.min(i + concurrency, this.options.batchSize);

            // Create concurrent promises for this batch
            for (let j = i; j < batchEnd; j++) {
                batch.push(this.runSingleRegistration());
            }

            // Wait for all in this batch to complete
            const batchResults = await Promise.allSettled(batch);

            // Process results
            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    results.push({
                        status: 'failed',
                        error: result.reason.message,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // Add delay between batches
            if (batchEnd < this.options.batchSize) {
                const delay = settings.automation.delayBetweenRegistrations;
                logger.info(`⏳ Waiting ${delay / 1000}s before next batch...`);
                await this.delay(delay);
            }
        }

        return this.generateBatchSummary(results, startTime);
    }

    generateBatchSummary(results, startTime) {
        const duration = Date.now() - startTime;
        const summary = {
            batchId: `batch_${Date.now()}`,
            totalRegistrations: this.options.batchSize,
            successful: results.filter(r => r && r.status === 'completed').length,
            failed: results.filter(r => !r || r.status === 'failed').length,
            duration: Math.round(duration / 1000),
            results
        };

        logger.info('📊 Batch completed!');
        logger.info(`✅ Successful: ${summary.successful}`);
        logger.info(`❌ Failed: ${summary.failed}`);
        logger.info(`⏱️  Duration: ${summary.duration}s`);
        logger.info(`📈 Success rate: ${((summary.successful / summary.totalRegistrations) * 100).toFixed(1)}%`);

        // Save batch summary
        this.saveBatchSummary(summary);

        return summary;
    }

    async saveRegistrationData(data) {
        try {
            const filename = `registration_${data.registrationId}.json`;
            const filepath = path.join(__dirname, '../logs/registrations', filename);
            await fs.ensureDir(path.dirname(filepath));
            await fs.writeJson(filepath, data, { spaces: 2 });

            // Also log to the main registrations log
            logger.info('REGISTRATION_SUCCESS', data);

        } catch (error) {
            logger.error('Failed to save registration data:', error);
        }
    }

    async saveBatchSummary(summary) {
        try {
            const filename = `batch_${summary.batchId}.json`;
            const filepath = path.join(__dirname, '../logs/batches', filename);
            await fs.ensureDir(path.dirname(filepath));
            await fs.writeJson(filepath, summary, { spaces: 2 });

        } catch (error) {
            logger.error('Failed to save batch summary:', error);
        }
    }

    async captureDebugInfo(browser, registrationId, error) {
        try {
            if (!browser) return;

            const page = (await browser.pages())[0];
            if (!page) return;

            const timestamp = Date.now();

            // Take screenshot
            if (process.env.SCREENSHOT_ON_ERROR === 'true') {
                const screenshotPath = path.join(__dirname, '../temp/screenshots', `error_${registrationId}_${timestamp}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: true });
                logger.debug(`Screenshot saved: ${screenshotPath}`);
            }

            // Save HTML content
            if (process.env.SAVE_HTML_ON_ERROR === 'true') {
                const htmlContent = await page.content();
                const htmlPath = path.join(__dirname, '../temp/screenshots', `error_${registrationId}_${timestamp}.html`);
                await fs.writeFile(htmlPath, htmlContent);
                logger.debug(`HTML saved: ${htmlPath}`);
            }

        } catch (debugError) {
            logger.warn('Failed to capture debug info:', debugError.message);
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printStats() {
        const duration = Math.round((Date.now() - this.stats.startTime) / 1000);
        const successRate = this.stats.attempted > 0 ? ((this.stats.successful / this.stats.attempted) * 100).toFixed(1) : 0;

        console.log('\n' + chalk.cyan('📊 Session Statistics:'));
        console.log(chalk.green(`✅ Successful: ${this.stats.successful}`));
        console.log(chalk.red(`❌ Failed: ${this.stats.failed}`));
        console.log(chalk.blue(`🎯 Total Attempted: ${this.stats.attempted}`));
        console.log(chalk.yellow(`📈 Success Rate: ${successRate}%`));
        console.log(chalk.magenta(`⏱️  Duration: ${duration}s`));
    }
}

// CLI Interface
async function main() {
    const program = new Command();

    program
        .name('kilocode-automation')
        .description('Automated Kilocode registration system')
        .version('1.0.0');

    program
        .option('-m, --mode <mode>', 'Operation mode: production, test', 'production')
        .option('-b, --batch <number>', 'Number of registrations to perform', '1')
        .option('-c, --concurrent <number>', 'Number of concurrent instances', '1')
        .option('--headless <boolean>', 'Run browser in headless mode', 'true')
        .option('-d, --debug', 'Enable debug mode', false)
        .option('--dry-run', 'Perform dry run without actual registration', false)
        .option('--use-dolphin', 'Use Dolphin Anty if configured (optional)', false);

    program.parse();
    const options = program.opts();

    // Convert string options to appropriate types
    options.batchSize = parseInt(options.batch);
    options.concurrentInstances = parseInt(options.concurrent);
    options.headless = options.headless === 'true';
    if (options.dryRun) options.mode = 'test';

    console.log(chalk.cyan('🚀 Kilocode Automation System'));
    console.log(chalk.yellow('============================\n'));

    // Validate environment
    const baseRequiredVars = ['PROXY_HOST', 'PROXY_PORT', 'PROXY_USERNAME', 'PROXY_PASSWORD'];
    const missingBase = baseRequiredVars.filter(envVar => !process.env[envVar]);

    const requireAntyHost = options.useDolphin || !!process.env.DOLPHIN_ANTY_TOKEN;
    const antyRequired = requireAntyHost ? ['DOLPHIN_ANTY_HOST'] : [];
    const missingAnty = antyRequired.filter(envVar => !process.env[envVar]);

    const missingEnvVars = [...missingBase, ...missingAnty];

    if (missingEnvVars.length > 0) {
        console.error(chalk.red(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`));
        console.error(chalk.yellow('Proxy variables are always required. Dolphin Anty host is required only when --use-dolphin is set or when DOLPHIN_ANTY_TOKEN is provided.'));
        process.exit(1);
    }

    // Initialize automation system
    const automation = new KilocodeAutomation(options);
    await automation.init();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n' + chalk.yellow('⏸️  Shutting down gracefully...'));
        automation.printStats();
        process.exit(0);
    });

    try {
        let results;

        if (options.batchSize === 1) {
            results = await automation.runSingleRegistration();
        } else {
            results = await automation.runBatch();
        }

        automation.printStats();

        if (options.batchSize === 1) {
            if (results && results.status && results.status !== 'failed') {
                console.log('\n' + chalk.green('✅ Automation completed successfully!'));
                process.exit(0);
            } else {
                console.log('\n' + chalk.red('❌ Automation completed with errors.'));
                process.exit(1);
            }
        } else {
            if (results && typeof results.failed === 'number' && results.failed === 0) {
                console.log('\n' + chalk.green('✅ Automation completed successfully!'));
                process.exit(0);
            } else {
                console.log('\n' + chalk.red('❌ Automation completed with errors.'));
                process.exit(1);
            }
        }

    } catch (error) {
        logger.error('Fatal error in main process:', error);
        automation.printStats();
        console.log('\n' + chalk.red('💥 Fatal error occurred!'));
        process.exit(1);
    }
}

// Export for testing
module.exports = KilocodeAutomation;

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('💥 Unhandled error:'), error);
        process.exit(1);
    });
}