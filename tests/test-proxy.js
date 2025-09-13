#!/usr/bin/env node

require('dotenv').config();
const chalk = require('chalk');

const ProxyManager = require('../config/proxies');
const logger = require('../utils/logger');

class ProxyTester {
    constructor() {
        this.proxyManager = new ProxyManager();
    }

    async runTests() {
        console.log(chalk.cyan('🧪 Proxy Functionality Test Suite'));
        console.log(chalk.yellow('==================================\\n'));

        try {
            // Test 1: Configuration Validation
            await this.testProxyConfiguration();

            // Test 2: Basic Connectivity
            await this.testBasicConnectivity();

            // Test 3: Session Rotation
            await this.testSessionRotation();

            // Test 4: All Sessions Test
            await this.testAllSessions();

            // Test 5: Working Proxy Detection
            await this.testWorkingProxyDetection();

            // Test 6: Health Monitoring
            await this.testHealthMonitoring();

            console.log(chalk.green('\\n✅ All proxy tests completed successfully!'));

        } catch (error) {
            console.log(chalk.red('\\n❌ Proxy tests failed!'));
            logger.error('Test suite failed:', error);
            process.exit(1);
        }
    }

    async testProxyConfiguration() {
        console.log(chalk.blue('⚙️  Testing proxy configuration...'));

        try {
            // Test configuration validation
            await this.proxyManager.validateProxyConfiguration();

            // Test proxy info display
            this.proxyManager.logProxyInfo();

            // Test configuration getters
            const proxyString = this.proxyManager.getProxyString();
            const puppeteerConfig = this.proxyManager.getProxyConfigForPuppeteer();
            const axiosConfig = this.proxyManager.getProxyConfigForAxios();

            console.log(`   Proxy string format: ${proxyString.substring(0, 20)}...`);
            console.log(`   Puppeteer config: ${puppeteerConfig.server}`);
            console.log(`   Axios config: ${axiosConfig.host}:${axiosConfig.port}`);

            console.log(chalk.green('✅ Proxy configuration test passed'));

        } catch (error) {
            console.log(chalk.red('❌ Proxy configuration test failed'));
            throw error;
        }
    }

    async testBasicConnectivity() {
        console.log(chalk.blue('🌐 Testing basic proxy connectivity...'));

        try {
            const result = await this.proxyManager.testProxyConnection();

            if (result.success) {
                console.log(chalk.green('✅ Basic connectivity test passed'));
                console.log(`   External IP: ${result.ip}`);
                console.log(`   Response time: ${result.responseTime}ms`);
            } else {
                throw new Error(`Connectivity test failed: ${result.error}`);
            }

        } catch (error) {
            console.log(chalk.red('❌ Basic connectivity test failed'));
            throw error;
        }
    }

    async testSessionRotation() {
        console.log(chalk.blue('🔄 Testing session rotation...'));

        try {
            const sessionResults = [];

            // Test multiple session rotations
            for (let i = 0; i < 5; i++) {
                const proxy = this.proxyManager.getNextProxy();
                const result = await this.proxyManager.testProxyConnection(proxy.sessionId);

                sessionResults.push({
                    sessionId: proxy.sessionId,
                    success: result.success,
                    ip: result.ip,
                    responseTime: result.responseTime
                });

                console.log(`   Session ${proxy.sessionId}: ${result.success ? '✅' : '❌'} ${result.ip || 'Failed'} (${result.responseTime || 0}ms)`);

                // Brief delay between tests
                await this.delay(1000);
            }

            const successfulSessions = sessionResults.filter(r => r.success).length;
            const uniqueIPs = new Set(sessionResults.filter(r => r.success).map(r => r.ip)).size;

            console.log(`   Successful sessions: ${successfulSessions}/5`);
            console.log(`   Unique IP addresses: ${uniqueIPs}`);

            if (successfulSessions >= 3) {
                console.log(chalk.green('✅ Session rotation test passed'));
            } else {
                throw new Error(`Only ${successfulSessions} out of 5 sessions worked`);
            }

        } catch (error) {
            console.log(chalk.red('❌ Session rotation test failed'));
            throw error;
        }
    }

    async testAllSessions() {
        console.log(chalk.blue('🔍 Testing all available sessions...'));

        try {
            const results = await this.proxyManager.testAllSessions();

            console.log(`   Total sessions tested: ${results.length}`);

            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);

            console.log(`   Successful sessions: ${successful.length}`);
            console.log(`   Failed sessions: ${failed.length}`);

            // Display successful sessions with IPs
            if (successful.length > 0) {
                console.log('\\n   Successful sessions:');
                successful.forEach(result => {
                    console.log(`     Session ${result.sessionId}: ${result.ip} (${result.responseTime}ms)`);
                });
            }

            // Display failed sessions
            if (failed.length > 0) {
                console.log('\\n   Failed sessions:');
                failed.slice(0, 3).forEach(result => {
                    console.log(`     Session ${result.sessionId}: ${result.error}`);
                });

                if (failed.length > 3) {
                    console.log(`     ... and ${failed.length - 3} more failures`);
                }
            }

            const successRate = (successful.length / results.length) * 100;
            console.log(`\\n   Success rate: ${successRate.toFixed(1)}%`);

            if (successRate >= 70) {
                console.log(chalk.green('✅ All sessions test passed'));
            } else {
                console.log(chalk.yellow('⚠️  All sessions test passed with warnings (low success rate)'));
            }

        } catch (error) {
            console.log(chalk.red('❌ All sessions test failed'));
            throw error;
        }
    }

    async testWorkingProxyDetection() {
        console.log(chalk.blue('🎯 Testing working proxy detection...'));

        try {
            const startTime = Date.now();
            const workingProxy = await this.proxyManager.getWorkingProxy();
            const detectionTime = Date.now() - startTime;

            console.log(`   Working proxy found: Session ${workingProxy.sessionId}`);
            console.log(`   Detection time: ${detectionTime}ms`);
            console.log(`   Proxy string: ${workingProxy.proxyString.substring(0, 30)}...`);

            // Verify the working proxy actually works
            const verificationResult = await this.proxyManager.testProxyConnection(workingProxy.sessionId);

            if (verificationResult.success) {
                console.log(`   Verification: ✅ ${verificationResult.ip} (${verificationResult.responseTime}ms)`);
                console.log(chalk.green('✅ Working proxy detection test passed'));
            } else {
                throw new Error('Working proxy detection returned non-working proxy');
            }

        } catch (error) {
            console.log(chalk.red('❌ Working proxy detection test failed'));
            throw error;
        }
    }

    async testHealthMonitoring() {
        console.log(chalk.blue('📊 Testing health monitoring...'));

        try {
            // Get initial health stats
            const initialStats = this.proxyManager.getHealthStats();
            console.log(`   Initial success rate: ${initialStats.successRate}`);
            console.log(`   Total checks: ${initialStats.totalChecks}`);
            console.log(`   Successful checks: ${initialStats.successfulChecks}`);

            // Perform a few more tests to update stats
            for (let i = 0; i < 3; i++) {
                const randomSession = Math.floor(Math.random() * 10);
                await this.proxyManager.testProxyConnection(randomSession);
                await this.delay(500);
            }

            // Get updated health stats
            const updatedStats = this.proxyManager.getHealthStats();
            console.log(`   Updated success rate: ${updatedStats.successRate}`);
            console.log(`   Updated total checks: ${updatedStats.totalChecks}`);
            console.log(`   Last check time: ${updatedStats.lastCheckTime}`);
            console.log(`   Last check status: ${updatedStats.lastCheckStatus}`);

            // Verify stats are being updated
            if (updatedStats.totalChecks > initialStats.totalChecks) {
                console.log(chalk.green('✅ Health monitoring test passed'));
            } else {
                throw new Error('Health stats not updating properly');
            }

        } catch (error) {
            console.log(chalk.red('❌ Health monitoring test failed'));
            throw error;
        }
    }

    async testProxyWithBrowser() {
        console.log(chalk.blue('🌐 Testing proxy with browser integration...'));

        let browser = null;

        try {
            const StealthBrowser = require('../src/stealth-browser');
            const stealthBrowser = new StealthBrowser();

            // Get a working proxy
            const workingProxy = await this.proxyManager.getWorkingProxy();
            console.log(`   Using proxy session: ${workingProxy.sessionId}`);

            // Launch browser with proxy
            browser = await stealthBrowser.launch(null, {
                headless: process.env.BROWSER_HEADLESS !== 'false',
                proxy: workingProxy
            });

            const page = await browser.newPage();

            // Test IP detection through browser
            await page.goto('https://httpbin.org/ip', { waitUntil: 'networkidle2', timeout: 15000 });

            const ipInfo = await page.evaluate(() => {
                try {
                    return JSON.parse(document.body.textContent);
                } catch (error) {
                    return { origin: 'unknown' };
                }
            });

            console.log(`   Browser detected IP: ${ipInfo.origin}`);

            // Compare with direct proxy test
            const directTest = await this.proxyManager.testProxyConnection(workingProxy.sessionId);
            console.log(`   Direct proxy test IP: ${directTest.ip}`);

            if (ipInfo.origin && ipInfo.origin !== 'unknown') {
                console.log(chalk.green('✅ Browser proxy integration test passed'));
            } else {
                throw new Error('Could not detect IP through browser');
            }

        } catch (error) {
            console.log(chalk.red('❌ Browser proxy integration test failed'));
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

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const helpFlag = args.includes('--help') || args.includes('-h');
    const browserTest = args.includes('--browser');

    if (helpFlag) {
        console.log(chalk.cyan('Proxy Functionality Test Suite'));
        console.log('\\nUsage: node test-proxy.js [options]');
        console.log('\\nOptions:');
        console.log('  --help, -h     Show this help message');
        console.log('  --browser      Include browser integration test');
        console.log('\\nEnvironment Variables:');
        console.log('  PROXY_HOST             iProxy host (default: x305.fxdx.in)');
        console.log('  PROXY_PORT             iProxy port (default: 15874)');
        console.log('  PROXY_USERNAME         iProxy username');
        console.log('  PROXY_PASSWORD         iProxy password');
        console.log('  BROWSER_HEADLESS=false Show browser during browser test');
        console.log('\\nExamples:');
        console.log('  node test-proxy.js                    # Run basic proxy tests');
        console.log('  node test-proxy.js --browser          # Include browser integration test');
        console.log('  BROWSER_HEADLESS=false node test-proxy.js --browser  # Browser test with visible browser');
        process.exit(0);
    }

    const tester = new ProxyTester();

    try {
        await tester.runTests();

        if (browserTest) {
            console.log();
            await tester.testProxyWithBrowser();
        }

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

module.exports = ProxyTester;