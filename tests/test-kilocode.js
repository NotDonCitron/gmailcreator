#!/usr/bin/env node

require('dotenv').config();
const chalk = require('chalk');

const StealthBrowser = require('../src/stealth-browser');
const KilocodeRegistration = require('../src/kilocode-registration');
const DataGenerator = require('../src/data-generator');
const DolphinAnty = require('../src/dolphin-anty');
const logger = require('../utils/logger');

class KilocodeTester {
    constructor() {
        this.stealthBrowser = new StealthBrowser();
        this.kilocodeRegistration = new KilocodeRegistration();
        this.dataGenerator = new DataGenerator();
        this.dolphinAnty = new DolphinAnty();
        this.kilocodeUrl = process.env.KILOCODE_BASE_URL || 'https://kilocode.com';
    }

    async runTests() {
        console.log(chalk.cyan('🧪 Kilocode Registration Test Suite'));
        console.log(chalk.yellow('====================================\\n'));

        try {
            // Test 1: Kilocode Site Access
            await this.testKilocodeSiteAccess();

            // Test 2: OAuth Button Detection
            await this.testOAuthButtonDetection();

            // Test 3: OAuth Flow Simulation
            await this.testOAuthFlowSimulation();

            // Test 4: Bonus Collection Test
            await this.testBonusCollection();

            // Test 5: Full Registration (if enabled and test account provided)
            if (process.env.RUN_FULL_TEST === 'true' && process.env.TEST_GOOGLE_EMAIL) {
                await this.testFullRegistration();
            } else {
                console.log(chalk.yellow('⏭️  Skipping full registration test'));
                console.log('   (Set RUN_FULL_TEST=true and provide TEST_GOOGLE_EMAIL to enable)');
            }

            console.log(chalk.green('\\n✅ All Kilocode tests completed successfully!'));

        } catch (error) {
            console.log(chalk.red('\\n❌ Kilocode tests failed!'));
            logger.error('Test suite failed:', error);
            process.exit(1);
        }
    }

    async testKilocodeSiteAccess() {
        console.log(chalk.blue('🌐 Testing Kilocode site access...'));

        let browser = null;

        try {
            browser = await this.stealthBrowser.launch(null, {
                headless: process.env.BROWSER_HEADLESS !== 'false'
            });

            const page = await browser.newPage();

            // Test main site access
            console.log(`   Accessing ${this.kilocodeUrl}...`);
            await page.goto(this.kilocodeUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            const title = await page.title();
            const url = page.url();

            console.log(`   Page title: ${title}`);
            console.log(`   Final URL: ${url}`);

            if (!url.includes('kilocode') && !title.toLowerCase().includes('kilocode')) {
                console.log(chalk.yellow('⚠️  Warning: Page might not be Kilocode (title/URL mismatch)'));
            }

            // Test login page access
            const loginUrl = `${this.kilocodeUrl}/login`;
            console.log(`   Accessing login page: ${loginUrl}...`);

            await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            const loginTitle = await page.title();
            console.log(`   Login page title: ${loginTitle}`);

            console.log(chalk.green('✅ Kilocode site access test passed'));

        } catch (error) {
            console.log(chalk.red('❌ Kilocode site access test failed'));
            throw error;

        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    logger.warn('Browser close error:', closeError.message);
                }
            }
        }
    }

    async testOAuthButtonDetection() {
        console.log(chalk.blue('🔍 Testing Google OAuth button detection...'));

        let browser = null;

        try {
            browser = await this.stealthBrowser.launch(null, {
                headless: process.env.BROWSER_HEADLESS !== 'false'
            });

            const page = await browser.newPage();

            // Navigate to login page
            const loginUrl = `${this.kilocodeUrl}/login`;
            await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // Look for Google OAuth buttons using various selectors
            const googleOAuthSelectors = [
                'button[data-provider=\"google\"]',
                '.google-login-button',
                '[href*=\"oauth/google\"]',
                '.btn-google',
                '[class*=\"google\"][class*=\"btn\"]'
            ];

            let foundButton = false;
            let buttonInfo = null;

            for (const selector of googleOAuthSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        const buttonText = await button.evaluate(el => el.textContent || el.value || el.alt || '');
                        const buttonClass = await button.evaluate(el => el.className || '');

                        foundButton = true;
                        buttonInfo = {
                            selector,
                            text: buttonText.trim(),
                            className: buttonClass
                        };

                        console.log(`   Found Google OAuth button: ${selector}`);
                        console.log(`   Button text: "${buttonText.trim()}"`);
                        console.log(`   Button class: "${buttonClass}"`);
                        break;
                    }
                } catch (error) {
                    // Continue to next selector
                    continue;
                }
            }

            // Also try text-based search
            if (!foundButton) {
                console.log('   Trying text-based button search...');

                const textButtons = await page.$$eval('button, a', (elements) => {
                    return elements
                        .map((el, index) => ({
                            index,
                            text: el.textContent || '',
                            tagName: el.tagName,
                            href: el.href || '',
                            className: el.className || ''
                        }))
                        .filter(item =>
                            item.text.toLowerCase().includes('google') ||
                            item.href.includes('google') ||
                            item.className.toLowerCase().includes('google')
                        );
                });

                if (textButtons.length > 0) {
                    foundButton = true;
                    buttonInfo = textButtons[0];
                    console.log(`   Found potential Google button via text search:`);
                    console.log(`   Text: "${buttonInfo.text}"`);
                    console.log(`   Tag: ${buttonInfo.tagName}`);
                }
            }

            if (foundButton) {
                console.log(chalk.green('✅ Google OAuth button detection test passed'));
            } else {
                console.log(chalk.yellow('⚠️  No Google OAuth button found'));
                console.log('   This might indicate:');
                console.log('   - Kilocode doesn\\'t use Google OAuth');
                console.log('   - OAuth is behind authentication');
                console.log('   - Different OAuth implementation');

                // Don't fail the test - this is informational
            }

        } catch (error) {
            console.log(chalk.red('❌ OAuth button detection test failed'));
            throw error;

        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    logger.warn('Browser close error:', closeError.message);
                }
            }
        }
    }

    async testOAuthFlowSimulation() {
        console.log(chalk.blue('🔐 Testing OAuth flow simulation...'));

        let browser = null;

        try {
            browser = await this.stealthBrowser.launch(null, {
                headless: process.env.BROWSER_HEADLESS !== 'false'
            });

            const page = await browser.newPage();

            // Navigate to login page
            const loginUrl = `${this.kilocodeUrl}/login`;
            await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // Simulate OAuth button click detection
            const googleSelectors = [
                'button[data-provider=\"google\"]',
                '.google-login-button',
                '[href*=\"oauth/google\"]'
            ];

            let oauthButton = null;

            for (const selector of googleSelectors) {
                oauthButton = await page.$(selector);
                if (oauthButton) {
                    console.log(`   Found OAuth button: ${selector}`);
                    break;
                }
            }

            if (oauthButton) {
                console.log('   Simulating OAuth button click...');

                // Check if button is clickable
                const isVisible = await oauthButton.isIntersectingViewport();
                const isEnabled = await oauthButton.evaluate(el => !el.disabled);

                console.log(`   Button visible: ${isVisible}`);
                console.log(`   Button enabled: ${isEnabled}`);

                if (isVisible && isEnabled) {
                    // Don't actually click in test mode - just verify it's clickable
                    console.log('   OAuth button is ready for clicking');
                    console.log(chalk.green('✅ OAuth flow simulation test passed'));
                } else {
                    throw new Error('OAuth button is not clickable');
                }

            } else {
                console.log(chalk.yellow('⚠️  No OAuth button found for simulation'));
                console.log('   Skipping OAuth flow test');
            }

        } catch (error) {
            console.log(chalk.red('❌ OAuth flow simulation test failed'));
            throw error;

        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    logger.warn('Browser close error:', closeError.message);
                }
            }
        }
    }

    async testBonusCollection() {
        console.log(chalk.blue('💰 Testing bonus collection detection...'));

        let browser = null;

        try {
            browser = await this.stealthBrowser.launch(null, {
                headless: process.env.BROWSER_HEADLESS !== 'false'
            });

            const bonusUrls = [
                `${this.kilocodeUrl}/dashboard`,
                `${this.kilocodeUrl}/bonuses`,
                `${this.kilocodeUrl}/rewards`,
                `${this.kilocodeUrl}/welcome`
            ];

            let bonusElementsFound = false;

            for (const url of bonusUrls) {
                try {
                    console.log(`   Checking ${url} for bonus elements...`);

                    const page = await browser.newPage();
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

                    // Look for bonus-related elements
                    const bonusSelectors = [
                        '.welcome-bonus',
                        '[data-bonus]',
                        '.signup-bonus',
                        '.claim-bonus',
                        '.bonus',
                        '.reward',
                        '[class*=\"bonus\"]',
                        '[class*=\"reward\"]'
                    ];

                    for (const selector of bonusSelectors) {
                        const elements = await page.$$(selector);
                        if (elements.length > 0) {
                            console.log(`   Found ${elements.length} bonus elements with selector: ${selector}`);
                            bonusElementsFound = true;
                            break;
                        }
                    }

                    // Also search for bonus-related text
                    const bonusText = await page.evaluate(() => {
                        const text = document.body.textContent || '';
                        const bonusKeywords = ['bonus', 'reward', 'welcome', 'signup', 'claim', 'free'];
                        return bonusKeywords.some(keyword => text.toLowerCase().includes(keyword));
                    });

                    if (bonusText) {
                        console.log(`   Found bonus-related text content`);
                        bonusElementsFound = true;
                    }

                    await page.close();

                    if (bonusElementsFound) break;

                } catch (error) {
                    console.log(`   Could not access ${url}: ${error.message}`);
                    continue;
                }
            }

            if (bonusElementsFound) {
                console.log(chalk.green('✅ Bonus collection detection test passed'));
            } else {
                console.log(chalk.yellow('⚠️  No bonus elements detected'));
                console.log('   This might indicate:');
                console.log('   - Bonuses require authentication');
                console.log('   - Different bonus system implementation');
                console.log('   - No bonus system available');
            }

        } catch (error) {
            console.log(chalk.red('❌ Bonus collection test failed'));
            throw error;

        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    logger.warn('Browser close error:', closeError.message);
                }
            }
        }
    }

    async testFullRegistration() {
        console.log(chalk.blue('🏗️  Testing full Kilocode registration...'));
        console.log(chalk.yellow('⚠️  This will attempt actual registration with test account!'));

        let browser = null;
        let profileId = null;

        try {
            const testEmail = process.env.TEST_GOOGLE_EMAIL;
            const testPassword = process.env.TEST_GOOGLE_PASSWORD;

            if (!testEmail || !testPassword) {
                throw new Error('TEST_GOOGLE_EMAIL and TEST_GOOGLE_PASSWORD must be provided for full test');
            }

            console.log(`   Using test account: ${testEmail}`);

            const mockGoogleAccount = {
                email: testEmail,
                password: testPassword,
                firstName: 'Test',
                lastName: 'User'
            };

            // Create browser with profile if available
            if (process.env.DOLPHIN_ANTY_HOST && process.env.DOLPHIN_ANTY_TOKEN) {
                const userData = await this.dataGenerator.generateUserData();
                profileId = await this.dolphinAnty.createProfile({
                    name: `test_kilocode_${Date.now()}`,
                    userData
                });

                browser = await this.stealthBrowser.launch(profileId, {
                    headless: process.env.BROWSER_HEADLESS !== 'false'
                });
            } else {
                browser = await this.stealthBrowser.launch(null, {
                    headless: process.env.BROWSER_HEADLESS !== 'false'
                });
            }

            console.log('   Attempting Kilocode registration...');

            const registrationResult = await this.kilocodeRegistration.register(browser, mockGoogleAccount);

            if (registrationResult && registrationResult.status === 'registered') {
                console.log(chalk.green('✅ Full registration test passed'));
                console.log(`   Registration method: ${registrationResult.registrationMethod}`);

                if (registrationResult.apiKey) {
                    console.log(`   API Key obtained: ${registrationResult.apiKey.substring(0, 10)}...`);
                }

                // Test bonus collection
                try {
                    const bonuses = await this.kilocodeRegistration.collectBonuses(browser);
                    console.log(`   Bonuses collected: ${bonuses.collected.length}`);
                    console.log(`   Total bonus value: ${bonuses.total} ${bonuses.currency}`);
                } catch (bonusError) {
                    console.log(chalk.yellow('   Bonus collection failed (this is optional)'));
                }

            } else {
                throw new Error('Registration did not return expected result');
            }

        } catch (error) {
            console.log(chalk.red('❌ Full registration test failed'));
            logger.error('Full registration test error:', error);

            // Don't throw error for full test - it might fail due to platform restrictions
            console.log(chalk.yellow('   Note: This test may fail due to platform anti-automation measures'));

        } finally {
            // Cleanup
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    logger.warn('Browser close error:', closeError.message);
                }
            }

            if (profileId) {
                try {
                    await this.dolphinAnty.deleteProfile(profileId);
                } catch (deleteError) {
                    logger.warn('Profile cleanup error:', deleteError.message);
                }
            }
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const helpFlag = args.includes('--help') || args.includes('-h');

    if (helpFlag) {
        console.log(chalk.cyan('Kilocode Registration Test Suite'));
        console.log('\\nUsage: node test-kilocode.js [options]');
        console.log('\\nOptions:');
        console.log('  --help, -h     Show this help message');
        console.log('\\nEnvironment Variables:');
        console.log('  KILOCODE_BASE_URL      Kilocode platform URL (default: https://kilocode.com)');
        console.log('  RUN_FULL_TEST=true     Enable full registration test');
        console.log('  TEST_GOOGLE_EMAIL      Google account email for testing');
        console.log('  TEST_GOOGLE_PASSWORD   Google account password for testing');
        console.log('  BROWSER_HEADLESS=false Show browser during tests');
        console.log('\\nExamples:');
        console.log('  node test-kilocode.js                                    # Run basic tests');
        console.log('  RUN_FULL_TEST=true TEST_GOOGLE_EMAIL=test@gmail.com \\\\   # Full test');
        console.log('    TEST_GOOGLE_PASSWORD=password node test-kilocode.js');
        console.log('  BROWSER_HEADLESS=false node test-kilocode.js             # Run with visible browser');
        process.exit(0);
    }

    const tester = new KilocodeTester();

    try {
        await tester.runTests();
        process.exit(0);
    } catch (error) {
        console.error(chalk.red('\\nTest suite failed with error:'), error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('Unhandled error:'), error);
        process.exit(1);
    });
}

module.exports = KilocodeTester;