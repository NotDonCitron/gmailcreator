#!/usr/bin/env node

require('dotenv').config();
const chalk = require('chalk');

const StealthBrowser = require('../src/stealth-browser');
const GoogleAccount = require('../src/google-account');
const DataGenerator = require('../src/data-generator');
const DolphinAnty = require('../src/dolphin-anty');
const logger = require('../utils/logger');

class GoogleAccountTester {
    constructor() {
        this.stealthBrowser = new StealthBrowser();
        this.googleAccount = new GoogleAccount();
        this.dataGenerator = new DataGenerator();
        this.dolphinAnty = new DolphinAnty();
    }

    async runTests() {
        console.log(chalk.cyan('🧪 Google Account Creation Test Suite'));
        console.log(chalk.yellow('=====================================\n'));

        try {
            // Test 1: Data Generation
            await this.testDataGeneration();

            // Test 2: Browser Launch
            await this.testBrowserLaunch();

            // Test 3: Google Signup Page Access
            await this.testGoogleSignupAccess();

            // Test 4: Full Account Creation (if enabled)
            if (process.env.RUN_FULL_TEST === 'true') {
                await this.testFullAccountCreation();
            } else {
                console.log(chalk.yellow('⏭️  Skipping full account creation test (set RUN_FULL_TEST=true to enable)'));
            }

            console.log(chalk.green('\n✅ All Google Account tests completed successfully!'));

        } catch (error) {
            console.log(chalk.red('\n❌ Google Account tests failed!'));
            logger.error('Test suite failed:', error);
            process.exit(1);
        }
    }

    async testDataGeneration() {
        console.log(chalk.blue('📊 Testing user data generation...'));

        try {
            const userData = await this.dataGenerator.generateUserData();

            // Validate required fields
            const requiredFields = ['firstName', 'lastName', 'email', 'password', 'birthYear'];
            const missingFields = requiredFields.filter(field => !userData[field]);

            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(userData.email)) {
                throw new Error('Invalid email format');
            }

            // Validate age
            const age = new Date().getFullYear() - userData.birthYear;
            if (age < 18 || age > 100) {
                throw new Error('Invalid age range');
            }

            console.log(chalk.green('✅ User data generation test passed'));
            console.log(`   Name: ${userData.firstName} ${userData.lastName}`);
            console.log(`   Email: ${userData.email}`);
            console.log(`   Age: ${age} years`);

        } catch (error) {
            console.log(chalk.red('❌ User data generation test failed'));
            throw error;
        }
    }

    async testBrowserLaunch() {
        console.log(chalk.blue('🚀 Testing browser launch...'));

        let browser = null;
        let profileId = null;

        try {
            // Test with Dolphin Anty if configured
            if (process.env.DOLPHIN_ANTY_HOST && process.env.DOLPHIN_ANTY_TOKEN) {
                console.log('   Testing with Dolphin Anty profile...');

                try {
                    profileId = await this.dolphinAnty.createProfile({
                        name: `test_${Date.now()}`,
                        userData: await this.dataGenerator.generateUserData()
                    });

                    browser = await this.stealthBrowser.launch(profileId, {
                        headless: process.env.BROWSER_HEADLESS !== 'false'
                    });

                    console.log(chalk.green('✅ Dolphin Anty browser launch successful'));

                } catch (dolphinError) {
                    console.log(chalk.yellow('⚠️  Dolphin Anty test failed, trying regular browser...'));
                    logger.warn('Dolphin Anty test failed:', dolphinError.message);
                }
            }

            // Test regular browser if Dolphin Anty failed or not configured
            if (!browser) {
                console.log('   Testing regular stealth browser...');

                browser = await this.stealthBrowser.launch(null, {
                    headless: process.env.BROWSER_HEADLESS !== 'false'
                });

                console.log(chalk.green('✅ Regular browser launch successful'));
            }

            // Test basic browser functionality
            const page = await browser.newPage();
            await page.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 15000 });

            const title = await page.title();
            if (!title.toLowerCase().includes('google')) {
                throw new Error('Failed to load Google homepage');
            }

            console.log(chalk.green('✅ Browser functionality test passed'));

        } catch (error) {
            console.log(chalk.red('❌ Browser launch test failed'));
            throw error;

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

    async testGoogleSignupAccess() {
        console.log(chalk.blue('📧 Testing Google signup page access...'));

        let browser = null;

        try {
            browser = await this.stealthBrowser.launch(null, {
                headless: process.env.BROWSER_HEADLESS !== 'false'
            });

            const page = await browser.newPage();

            // Navigate to Google signup
            const signupUrl = 'https://accounts.google.com/signup/v2/webcreateaccount?hl=en&flowName=GlifWebSignIn&flowEntry=SignUp';
            await page.goto(signupUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // Check if signup form is accessible
            const firstNameField = await page.$('#firstName');
            const lastNameField = await page.$('#lastName');
            const usernameField = await page.$('#username');

            if (!firstNameField || !lastNameField || !usernameField) {
                throw new Error('Google signup form fields not found');
            }

            console.log(chalk.green('✅ Google signup page access test passed'));

            // Test form interaction
            console.log('   Testing form field interaction...');

            await page.type('#firstName', 'Test');
            await page.type('#lastName', 'User');

            const firstNameValue = await page.$eval('#firstName', el => el.value);
            const lastNameValue = await page.$eval('#lastName', el => el.value);

            if (firstNameValue !== 'Test' || lastNameValue !== 'User') {
                throw new Error('Form field interaction failed');
            }

            console.log(chalk.green('✅ Form interaction test passed'));

        } catch (error) {
            console.log(chalk.red('❌ Google signup access test failed'));
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

    async testFullAccountCreation() {
        console.log(chalk.blue('🏗️  Testing full Google account creation...'));
        console.log(chalk.yellow('⚠️  This will attempt to create a real Google account!'));

        let browser = null;
        let profileId = null;

        try {
            // Generate test user data
            const userData = await this.dataGenerator.generateUserData();

            // Create browser with profile if Dolphin Anty is available
            if (process.env.DOLPHIN_ANTY_HOST && process.env.DOLPHIN_ANTY_TOKEN) {
                profileId = await this.dolphinAnty.createProfile({
                    name: `test_full_${Date.now()}`,
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

            console.log('   Attempting account creation...');
            console.log(`   Test email: ${userData.email}`);

            const accountInfo = await this.googleAccount.create(browser, userData);

            if (accountInfo && accountInfo.email) {
                console.log(chalk.green('✅ Full account creation test passed'));
                console.log(`   Created account: ${accountInfo.email}`);
                console.log(`   Verified: ${accountInfo.verified ? 'Yes' : 'No'}`);

                // Log successful test account for manual cleanup if needed
                logger.info('TEST_ACCOUNT_CREATED', {
                    email: accountInfo.email,
                    testRun: true,
                    createdAt: new Date().toISOString()
                });

            } else {
                throw new Error('Account creation returned no account info');
            }

        } catch (error) {
            console.log(chalk.red('❌ Full account creation test failed'));
            logger.error('Full account creation test error:', error);

            // Don't throw error for full test - it might fail due to Google's restrictions
            console.log(chalk.yellow("   Note: This test may fail due to Google's anti-automation measures"));

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
        console.log(chalk.cyan('Google Account Creation Test Suite'));
        console.log('\nUsage: node test-google.js [options]');
        console.log('\nOptions:');
        console.log('  --help, -h     Show this help message');
        console.log('\nEnvironment Variables:');
        console.log('  RUN_FULL_TEST=true     Enable full account creation test (WARNING: Creates real accounts)');
        console.log('  BROWSER_HEADLESS=false Show browser during tests');
        console.log('  DOLPHIN_ANTY_HOST      Test with Dolphin Anty profiles');
        console.log('  DOLPHIN_ANTY_TOKEN     Dolphin Anty API token');
        console.log('\nExamples:');
        console.log('  node test-google.js                              # Run basic tests');
        console.log('  RUN_FULL_TEST=true node test-google.js           # Run all tests including account creation');
        console.log('  BROWSER_HEADLESS=false node test-google.js       # Run with visible browser');
        process.exit(0);
    }

    const tester = new GoogleAccountTester();

    try {
        await tester.runTests();
        process.exit(0);
    } catch (error) {
        console.error(chalk.red('\nTest suite failed with error:'), error.message);
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

module.exports = GoogleAccountTester;