const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalk = require('chalk');
require('dotenv').config();

class EnvironmentTester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            tests: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}]`;

        switch (type) {
            case 'success':
                console.log(chalk.green(`${prefix} ✓ ${message}`));
                break;
            case 'error':
                console.log(chalk.red(`${prefix} ✗ ${message}`));
                break;
            case 'warning':
                console.log(chalk.yellow(`${prefix} ⚠ ${message}`));
                break;
            case 'info':
            default:
                console.log(chalk.blue(`${prefix} ℹ ${message}`));
        }
    }

    addResult(testName, passed, message, isWarning = false) {
        this.results.tests.push({ testName, passed, message, isWarning });
        if (isWarning) {
            this.results.warnings++;
        } else if (passed) {
            this.results.passed++;
        } else {
            this.results.failed++;
        }
    }

    async testNodeVersion() {
        try {
            const version = process.version;
            const majorVersion = parseInt(version.substring(1).split('.')[0]);

            if (majorVersion >= 16) {
                this.log(`Node.js version: ${version}`, 'success');
                this.addResult('Node.js Version', true, `Version ${version} meets requirement (>=16)`);
                return true;
            } else {
                this.log(`Node.js version: ${version} (minimum required: 16)`, 'error');
                this.addResult('Node.js Version', false, `Version ${version} does not meet requirement (>=16)`);
                return false;
            }
        } catch (error) {
            this.log(`Failed to check Node.js version: ${error.message}`, 'error');
            this.addResult('Node.js Version', false, `Error checking version: ${error.message}`);
            return false;
        }
    }

    testEnvironmentVariables() {
        const required = [
            'DOLPHIN_ANTY_HOST',
            'DOLPHIN_ANTY_TOKEN',
            'PROXY_HOST',
            'PROXY_PORT',
            'PROXY_USERNAME',
            'PROXY_PASSWORD'
        ];

        const optional = [
            'TWOCAPTCHA_API_KEY',
            'CAPTCHA_SERVICE',
            'LOG_LEVEL',
            'BROWSER_HEADLESS'
        ];

        let allRequired = true;

        this.log('Checking required environment variables...');
        required.forEach(varName => {
            if (process.env[varName]) {
                if (varName.includes('TOKEN') || varName.includes('PASSWORD') || varName.includes('API_KEY')) {
                    this.log(`${varName}: [CONFIGURED]`, 'success');
                } else {
                    this.log(`${varName}: ${process.env[varName]}`, 'success');
                }
                this.addResult(`ENV: ${varName}`, true, 'Required variable is set');
            } else {
                this.log(`${varName}: NOT SET`, 'error');
                this.addResult(`ENV: ${varName}`, false, 'Required variable is missing');
                allRequired = false;
            }
        });

        this.log('Checking optional environment variables...');
        optional.forEach(varName => {
            if (process.env[varName]) {
                if (varName.includes('TOKEN') || varName.includes('PASSWORD') || varName.includes('API_KEY')) {
                    this.log(`${varName}: [CONFIGURED]`, 'success');
                } else {
                    this.log(`${varName}: ${process.env[varName]}`, 'success');
                }
                this.addResult(`ENV: ${varName}`, true, 'Optional variable is set', true);
            } else {
                this.log(`${varName}: NOT SET (optional)`, 'warning');
                this.addResult(`ENV: ${varName}`, true, 'Optional variable not set', true);
            }
        });

        return allRequired;
    }

    async testDolphinAntyAPI() {
        try {
            const baseUrl = process.env.DOLPHIN_ANTY_HOST || 'http://localhost:3001';
            const token = process.env.DOLPHIN_ANTY_TOKEN;

            if (!token || token === 'your_dolphin_anty_token_here') {
                this.log('Dolphin Anty token not configured', 'warning');
                this.addResult('Dolphin Anty API', true, 'Token not configured (skipped)', true);
                return true;
            }

            this.log('Testing Dolphin Anty API connectivity...');

            const response = await axios.get(`${baseUrl}/v1.0/browser_profiles`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: 10000
            });

            if (response.status === 200) {
                this.log('Dolphin Anty API: Connected successfully', 'success');
                this.addResult('Dolphin Anty API', true, 'API connection successful');
                return true;
            } else {
                this.log(`Dolphin Anty API: Unexpected response ${response.status}`, 'error');
                this.addResult('Dolphin Anty API', false, `Unexpected response status: ${response.status}`);
                return false;
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                this.log('Dolphin Anty API: Connection refused (service not running)', 'error');
                this.addResult('Dolphin Anty API', false, 'Connection refused - service not running');
            } else if (error.response?.status === 401) {
                this.log('Dolphin Anty API: Authentication failed', 'error');
                this.addResult('Dolphin Anty API', false, 'Authentication failed - check token');
            } else {
                this.log(`Dolphin Anty API: ${error.message}`, 'error');
                this.addResult('Dolphin Anty API', false, `Connection error: ${error.message}`);
            }
            return false;
        }
    }

    async testProxyConnectivity() {
        try {
            const proxyHost = process.env.PROXY_HOST;
            const proxyPort = process.env.PROXY_PORT;
            const proxyUsername = process.env.PROXY_USERNAME;
            const proxyPassword = process.env.PROXY_PASSWORD;

            if (!proxyHost || !proxyPort) {
                this.log('Proxy configuration incomplete', 'error');
                this.addResult('Proxy Connectivity', false, 'Missing proxy host or port');
                return false;
            }

            this.log('Testing proxy connectivity...');

            let proxyUrl;
            if (proxyUsername && proxyPassword) {
                proxyUrl = `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;
            } else {
                proxyUrl = `http://${proxyHost}:${proxyPort}`;
            }

            const agent = new HttpsProxyAgent(proxyUrl);

            const response = await axios.get('https://httpbin.org/ip', {
                httpsAgent: agent,
                timeout: 15000
            });

            if (response.status === 200) {
                const ip = response.data.origin;
                this.log(`Proxy connection successful. External IP: ${ip}`, 'success');
                this.addResult('Proxy Connectivity', true, `Connected successfully. IP: ${ip}`);
                return true;
            } else {
                this.log(`Proxy test failed with status: ${response.status}`, 'error');
                this.addResult('Proxy Connectivity', false, `HTTP status: ${response.status}`);
                return false;
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                this.log('Proxy connection refused or timed out', 'error');
                this.addResult('Proxy Connectivity', false, 'Connection refused/timeout - check proxy settings');
            } else if (error.code === 'ENOTFOUND') {
                this.log('Proxy host not found', 'error');
                this.addResult('Proxy Connectivity', false, 'Proxy host not found - check hostname');
            } else {
                this.log(`Proxy test error: ${error.message}`, 'error');
                this.addResult('Proxy Connectivity', false, `Error: ${error.message}`);
            }
            return false;
        }
    }

    async testCaptchaService() {
        try {
            const apiKey = process.env.TWOCAPTCHA_API_KEY;
            const service = process.env.CAPTCHA_SERVICE || '2captcha';

            if (!apiKey || apiKey === 'your_2captcha_api_key_here') {
                this.log('2captcha API key not configured (optional)', 'warning');
                this.addResult('Captcha Service', true, 'API key not configured (optional)', true);
                return true;
            }

            if (service === '2captcha') {
                this.log('Testing 2captcha API...');

                const response = await axios.post('http://2captcha.com/res.php', null, {
                    params: {
                        key: apiKey,
                        action: 'getbalance'
                    },
                    timeout: 10000
                });

                if (response.data.startsWith('OK|')) {
                    const balance = response.data.split('|')[1];
                    this.log(`2captcha API: Connected. Balance: $${balance}`, 'success');
                    this.addResult('Captcha Service', true, `Connected successfully. Balance: $${balance}`);
                    return true;
                } else {
                    this.log(`2captcha API error: ${response.data}`, 'error');
                    this.addResult('Captcha Service', false, `API error: ${response.data}`);
                    return false;
                }
            } else {
                this.log(`Unknown captcha service: ${service}`, 'warning');
                this.addResult('Captcha Service', true, `Unknown service: ${service}`, true);
                return true;
            }
        } catch (error) {
            this.log(`Captcha service test error: ${error.message}`, 'error');
            this.addResult('Captcha Service', false, `Connection error: ${error.message}`);
            return false;
        }
    }

    testFileSystemPermissions() {
        const directories = ['./logs', './temp', './temp/profiles', './temp/screenshots'];
        let allPassed = true;

        this.log('Testing file system permissions...');

        directories.forEach(dir => {
            try {
                // Test directory creation
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                // Test file write
                const testFile = path.join(dir, 'test-write.tmp');
                fs.writeFileSync(testFile, 'test');

                // Test file read
                const content = fs.readFileSync(testFile, 'utf8');

                // Cleanup
                fs.unlinkSync(testFile);

                if (content === 'test') {
                    this.log(`Directory ${dir}: Read/write OK`, 'success');
                    this.addResult(`Permissions: ${dir}`, true, 'Read/write permissions OK');
                } else {
                    this.log(`Directory ${dir}: Read test failed`, 'error');
                    this.addResult(`Permissions: ${dir}`, false, 'Read test failed');
                    allPassed = false;
                }
            } catch (error) {
                this.log(`Directory ${dir}: ${error.message}`, 'error');
                this.addResult(`Permissions: ${dir}`, false, `Error: ${error.message}`);
                allPassed = false;
            }
        });

        return allPassed;
    }

    testDependencies() {
        const requiredPackages = [
            'puppeteer',
            'puppeteer-extra',
            'axios',
            'winston',
            'dotenv',
            'faker',
            'proxy-chain',
            '2captcha'
        ];

        let allInstalled = true;

        this.log('Testing required dependencies...');

        requiredPackages.forEach(packageName => {
            try {
                require.resolve(packageName);
                this.log(`Package ${packageName}: Installed`, 'success');
                this.addResult(`Dependency: ${packageName}`, true, 'Package installed');
            } catch (error) {
                this.log(`Package ${packageName}: Not installed`, 'error');
                this.addResult(`Dependency: ${packageName}`, false, 'Package not installed');
                allInstalled = false;
            }
        });

        return allInstalled;
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log(chalk.bold('ENVIRONMENT TEST SUMMARY'));
        console.log('='.repeat(60));

        console.log(chalk.green(`✓ Passed: ${this.results.passed}`));
        console.log(chalk.red(`✗ Failed: ${this.results.failed}`));
        console.log(chalk.yellow(`⚠ Warnings: ${this.results.warnings}`));
        console.log(`Total Tests: ${this.results.tests.length}`);

        if (this.results.failed > 0) {
            console.log('\n' + chalk.red('FAILED TESTS:'));
            this.results.tests
                .filter(t => !t.passed && !t.isWarning)
                .forEach(test => {
                    console.log(chalk.red(`  ✗ ${test.testName}: ${test.message}`));
                });
        }

        if (this.results.warnings > 0) {
            console.log('\n' + chalk.yellow('WARNINGS:'));
            this.results.tests
                .filter(t => t.isWarning)
                .forEach(test => {
                    console.log(chalk.yellow(`  ⚠ ${test.testName}: ${test.message}`));
                });
        }

        console.log('\n' + '='.repeat(60));

        if (this.results.failed === 0) {
            console.log(chalk.green('✅ Environment is ready for automation!'));
            if (this.results.warnings > 0) {
                console.log(chalk.yellow('⚠ Some optional features may not be available'));
            }
        } else {
            console.log(chalk.red('❌ Environment setup needs attention'));
            console.log('Please fix the failed tests before running automation');
        }
    }

    async runAllTests() {
        console.log(chalk.bold('🧪 Running Environment Tests...\n'));

        await this.testNodeVersion();
        this.testEnvironmentVariables();
        this.testDependencies();
        this.testFileSystemPermissions();
        await this.testDolphinAntyAPI();
        await this.testProxyConnectivity();
        await this.testCaptchaService();

        this.printSummary();

        return this.results.failed === 0;
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new EnvironmentTester();
    tester.runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error(chalk.red('Test runner error:'), error);
        process.exit(1);
    });
}

module.exports = EnvironmentTester;