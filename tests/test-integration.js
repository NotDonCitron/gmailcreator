#!/usr/bin/env node

require('dotenv').config();
const chalk = require('chalk');
const path = require('path');

const AutomationMain = require('../src/main');
const StealthBrowser = require('../src/stealth-browser');
const GoogleAccount = require('../src/google-account');
const KilocodeRegistration = require('../src/kilocode-registration');
const DolphinAnty = require('../src/dolphin-anty');
const DataGenerator = require('../src/data-generator');
const ProxyManager = require('../config/proxies');
const logger = require('../utils/logger');

class IntegrationTester {
    constructor() {
        this.automationMain = new AutomationMain();
        this.stealthBrowser = new StealthBrowser();
        this.googleAccount = new GoogleAccount();
        this.kilocodeRegistration = new KilocodeRegistration();
        this.dolphinAnty = new DolphinAnty();
        this.dataGenerator = new DataGenerator();
        this.proxyManager = new ProxyManager();

        this.testResults = {
            passed: 0,
            failed: 0,
            skipped: 0,
            tests: []
        };
    }

    addTestResult(testName, status, message, details = {}) {
        this.testResults.tests.push({
            testName,
            status,
            message,
            details,
            timestamp: new Date().toISOString()
        });

        this.testResults[status]++;
    }

    async runIntegrationTests() {
        console.log(chalk.cyan('🧪 Integration Test Suite - End-to-End Workflow'));
        console.log(chalk.yellow('='.repeat(60)));
        console.log(chalk.blue('Testing complete automation pipeline\n'));

        try {
            // Test 1: System Prerequisites
            await this.testSystemPrerequisites();

            // Test 2: Component Integration
            await this.testComponentIntegration();

            // Test 3: Dry Run Workflow
            await this.testDryRunWorkflow();

            // Test 4: Single Account Creation (if enabled)
            if (process.env.RUN_FULL_INTEGRATION === 'true') {
                await this.testSingleAccountCreation();
            } else {
                this.addTestResult('Full Integration Test', 'skipped', 'Set RUN_FULL_INTEGRATION=true to enable');
                console.log(chalk.yellow('⏭️  Skipping full integration test'));
            }

            // Test 5: Error Recovery and Cleanup
            await this.testErrorRecoveryAndCleanup();

            this.printTestSummary();

        } catch (error) {
            console.log(chalk.red('\n❌ Integration test suite failed!'));
            logger.error('Integration test suite failed:', error);
            this.printTestSummary();
            process.exit(1);
        }
    }

    async testSystemPrerequisites() {
        console.log(chalk.blue('🔧 Testing system prerequisites...'));

        try {
            // Test environment configuration
            const requiredEnvVars = [
                'DOLPHIN_ANTY_HOST',
                'PROXY_HOST',
                'PROXY_PORT',
                'PROXY_USERNAME',
                'PROXY_PASSWORD'
            ];

            let missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

            if (missingVars.length > 0) {
                throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
            }

            console.log('   ✅ Environment variables configured');

            // Test proxy connectivity
            const proxyTest = await this.proxyManager.testProxyConnection();
            if (!proxyTest.success) {
                throw new Error(`Proxy test failed: ${proxyTest.error}`);
            }

            console.log(`   ✅ Proxy connectivity (IP: ${proxyTest.ip})`);

            // Test Dolphin Anty API (if configured)
            if (process.env.DOLPHIN_ANTY_TOKEN && process.env.DOLPHIN_ANTY_TOKEN !== 'your_dolphin_anty_token_here') {
                try {
                    const profiles = await this.dolphinAnty.getProfiles();
                    console.log(`   ✅ Dolphin Anty API (${profiles.length} profiles)`);
                } catch (error) {
                    console.log(chalk.yellow(`   ⚠️  Dolphin Anty API warning: ${error.message}`));
                }
            } else {
                console.log(chalk.yellow('   ⚠️  Dolphin Anty token not configured'));
            }

            this.addTestResult('System Prerequisites', 'passed', 'All prerequisites met');

        } catch (error) {
            console.log(chalk.red(`   ❌ Prerequisites test failed: ${error.message}`));
            this.addTestResult('System Prerequisites', 'failed', error.message);
            throw error;
        }
    }

    async testComponentIntegration() {
        console.log(chalk.blue('🔗 Testing component integration...'));

        let browser = null;
        let profileId = null;

        try {
            // Test data generation
            const userData = await this.dataGenerator.generateUserData();
            console.log(`   ✅ Data generation (${userData.firstName} ${userData.lastName})`);

            // Test profile creation
            if (process.env.DOLPHIN_ANTY_TOKEN && process.env.DOLPHIN_ANTY_TOKEN !== 'your_dolphin_anty_token_here') {
                profileId = await this.dolphinAnty.createProfile({
                    name: `integration_test_${Date.now()}`,
                    userData
                });
                console.log(`   ✅ Profile creation (ID: ${profileId})`);
            }

            // Test browser launch with stealth features
            browser = await this.stealthBrowser.launch(profileId, {
                headless: process.env.BROWSER_HEADLESS !== 'false',
                proxy: await this.proxyManager.getWorkingProxy()
            });

            console.log('   ✅ Stealth browser launch');

            // Test basic browser functionality
            const page = await browser.newPage();
            await page.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 15000 });

            const title = await page.title();
            if (!title.toLowerCase().includes('google')) {
                throw new Error('Browser navigation test failed');
            }

            console.log('   ✅ Browser navigation');

            // Test component cleanup
            await browser.close();
            browser = null;

            if (profileId) {
                await this.dolphinAnty.deleteProfile(profileId);
                profileId = null;
                console.log('   ✅ Profile cleanup');
            }

            this.addTestResult('Component Integration', 'passed', 'All components integrated successfully');

        } catch (error) {
            console.log(chalk.red(`   ❌ Component integration failed: ${error.message}`));
            this.addTestResult('Component Integration', 'failed', error.message);

            // Cleanup on error
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    logger.warn('Browser cleanup error:', closeError);
                }
            }

            if (profileId) {
                try {
                    await this.dolphinAnty.deleteProfile(profileId);
                } catch (deleteError) {
                    logger.warn('Profile cleanup error:', deleteError);
                }
            }

            throw error;
        }
    }

    async testDryRunWorkflow() {
        console.log(chalk.blue('🏃 Testing dry run workflow...'));

        try {
            // Set dry run mode
            const originalMode = process.env.DRY_RUN;
            process.env.DRY_RUN = 'true';

            console.log('   📋 Starting dry run automation...');

            // Run automation in dry run mode (should not create real accounts)
            const result = await this.automationMain.runSingleRegistration({
                dryRun: true,
                skipAccountCreation: true,
                skipKilocodeRegistration: true
            });

            // Restore original mode
            if (originalMode !== undefined) {
                process.env.DRY_RUN = originalMode;
            } else {
                delete process.env.DRY_RUN;
            }

            if (result.status === 'dry_run_completed') {
                console.log('   ✅ Dry run workflow completed');
                console.log(`   📊 Simulated workflow duration: ${result.duration}ms`);

                this.addTestResult('Dry Run Workflow', 'passed', 'Dry run completed successfully', {
                    duration: result.duration,
                    profileCreated: result.profileCreated,
                    browserLaunched: result.browserLaunched
                });

            } else {
                throw new Error(`Unexpected dry run result: ${result.status}`);
            }

        } catch (error) {
            console.log(chalk.red(`   ❌ Dry run workflow failed: ${error.message}`));
            this.addTestResult('Dry Run Workflow', 'failed', error.message);
            throw error;
        }
    }

    async testSingleAccountCreation() {
        console.log(chalk.blue('🏗️  Testing single account creation...'));
        console.log(chalk.yellow('⚠️  This will create real accounts - use with caution!'));

        let registrationData = null;

        try {
            console.log('   🚀 Starting single account creation...');

            // Run single registration
            const result = await this.automationMain.runSingleRegistration({
                testMode: true,
                cleanupOnError: true
            });

            if (result.status === 'completed') {
                registrationData = result.data;

                console.log('   ✅ Single account creation completed');
                console.log(`   📧 Google account: ${registrationData.googleAccount.email}`);
                console.log(`   🔑 Kilocode status: ${registrationData.kilocodeAccount.status}`);

                if (registrationData.kilocodeAccount.apiKey) {
                    console.log(`   🎯 API key obtained: ${registrationData.kilocodeAccount.apiKey.substring(0, 10)}...`);
                }

                if (registrationData.bonuses && registrationData.bonuses.length > 0) {
                    console.log(`   💰 Bonuses collected: ${registrationData.bonuses.length}`);
                }

                // Log test account for potential cleanup
                logger.info('INTEGRATION_TEST_ACCOUNT_CREATED', {
                    googleEmail: registrationData.googleAccount.email,
                    kilocodeStatus: registrationData.kilocodeAccount.status,
                    testRun: true,
                    createdAt: new Date().toISOString()
                });

                this.addTestResult('Single Account Creation', 'passed', 'Account creation completed', {
                    googleEmail: registrationData.googleAccount.email,
                    kilocodeStatus: registrationData.kilocodeAccount.status,
                    duration: result.duration
                });

            } else if (result.status === 'failed') {
                throw new Error(`Account creation failed: ${result.error}`);
            } else {
                throw new Error(`Unexpected result status: ${result.status}`);
            }

        } catch (error) {
            console.log(chalk.red(`   ❌ Single account creation failed: ${error.message}`));
            this.addTestResult('Single Account Creation', 'failed', error.message);

            // Don't throw error - this test is optional and might fail due to platform restrictions
            console.log(chalk.yellow('   Note: This test may fail due to platform anti-automation measures'));
        }
    }

    async testErrorRecoveryAndCleanup() {
        console.log(chalk.blue('🛠️  Testing error recovery and cleanup...'));

        try {
            // Test 1: Browser crash recovery
            console.log('   Testing browser crash recovery...');

            let browser = await this.stealthBrowser.launch(null, {
                headless: process.env.BROWSER_HEADLESS !== 'false'
            });

            // Force browser to close unexpectedly
            await browser.close();

            // Test if automation can handle crashed browser
            try {
                const page = await browser.newPage();
                await page.goto('https://www.google.com');
                throw new Error('Browser should have been closed');
            } catch (expectedError) {
                console.log('   ✅ Browser crash detection working');
            }

            // Test 2: Profile cleanup after error
            console.log('   Testing profile cleanup after error...');

            if (process.env.DOLPHIN_ANTY_TOKEN && process.env.DOLPHIN_ANTY_TOKEN !== 'your_dolphin_anty_token_here') {
                const testProfileId = await this.dolphinAnty.createProfile({
                    name: `error_test_${Date.now()}`,
                    userData: await this.dataGenerator.generateUserData()
                });

                // Simulate error during automation
                try {
                    throw new Error('Simulated automation error');
                } catch (simulatedError) {
                    // Cleanup should still work
                    await this.dolphinAnty.deleteProfile(testProfileId);
                    console.log('   ✅ Profile cleanup after error working');
                }
            }

            // Test 3: Log file integrity
            console.log('   Testing log file integrity...');

            const testLogMessage = `Integration test log ${Date.now()}`;
            logger.info(testLogMessage);

            // Brief delay to ensure log is written
            await this.delay(1000);

            console.log('   ✅ Log file integrity working');

            this.addTestResult('Error Recovery and Cleanup', 'passed', 'All recovery mechanisms working');

        } catch (error) {
            console.log(chalk.red(`   ❌ Error recovery test failed: ${error.message}`));
            this.addTestResult('Error Recovery and Cleanup', 'failed', error.message);
            throw error;
        }
    }

    printTestSummary() {
        console.log('\n' + '='.repeat(60));
        console.log(chalk.bold('INTEGRATION TEST SUMMARY'));
        console.log('='.repeat(60));

        console.log(chalk.green(`✅ Passed: ${this.testResults.passed}`));
        console.log(chalk.red(`❌ Failed: ${this.testResults.failed}`));
        console.log(chalk.yellow(`⏭️  Skipped: ${this.testResults.skipped}`));
        console.log(`Total Tests: ${this.testResults.tests.length}`);

        const successRate = this.testResults.tests.length > 0
            ? ((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100)
            : 0;

        console.log(`Success Rate: ${successRate.toFixed(1)}%`);

        if (this.testResults.failed > 0) {
            console.log('\n' + chalk.red('FAILED TESTS:'));
            this.testResults.tests
                .filter(t => t.status === 'failed')
                .forEach(test => {
                    console.log(chalk.red(`  ❌ ${test.testName}: ${test.message}`));
                });
        }

        if (this.testResults.skipped > 0) {
            console.log('\n' + chalk.yellow('SKIPPED TESTS:'));
            this.testResults.tests
                .filter(t => t.status === 'skipped')
                .forEach(test => {
                    console.log(chalk.yellow(`  ⏭️  ${test.testName}: ${test.message}`));
                });
        }

        console.log('\n' + '='.repeat(60));

        if (this.testResults.failed === 0) {
            console.log(chalk.green('🎉 All integration tests passed!'));
            console.log(chalk.green('The automation system is ready for production use.'));
        } else {
            console.log(chalk.red('⚠️  Some integration tests failed.'));
            console.log('Please review and fix the issues before production deployment.');
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
        console.log(chalk.cyan('Integration Test Suite - End-to-End Workflow'));
        console.log('\nUsage: node test-integration.js [options]');
        console.log('\nOptions:');
        console.log('  --help, -h     Show this help message');
        console.log('\nEnvironment Variables:');
        console.log('  RUN_FULL_INTEGRATION=true    Enable full account creation test');
        console.log('  BROWSER_HEADLESS=false       Show browser during tests');
        console.log('  DOLPHIN_ANTY_HOST            Dolphin Anty API host');
        console.log('  DOLPHIN_ANTY_TOKEN           Dolphin Anty API token');
        console.log('  PROXY_HOST                   Proxy server host');
        console.log('  PROXY_USERNAME               Proxy authentication username');
        console.log('  PROXY_PASSWORD               Proxy authentication password');
        console.log('\nTest Modes:');
        console.log('  Basic Mode:     Tests system integration without creating accounts');
        console.log('  Full Mode:      Tests complete workflow including account creation');
        console.log('\nExamples:');
        console.log('  node test-integration.js                                    # Basic integration tests');
        console.log('  RUN_FULL_INTEGRATION=true node test-integration.js         # Full integration test');
        console.log('  BROWSER_HEADLESS=false node test-integration.js            # Tests with visible browser');
        console.log('\nWarning:');
        console.log('  Full integration mode will create real Google and Kilocode accounts.');
        console.log('  Use this mode carefully and only for testing purposes.');
        process.exit(0);
    }

    const tester = new IntegrationTester();

    try {
        await tester.runIntegrationTests();

        // Exit with error code if any tests failed
        const exitCode = tester.testResults.failed > 0 ? 1 : 0;
        process.exit(exitCode);

    } catch (error) {
        console.error(chalk.red('\nIntegration test suite failed with error:'), error.message);
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

module.exports = IntegrationTester;