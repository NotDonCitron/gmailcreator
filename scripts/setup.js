#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const chalk = require('chalk');

class SetupWizard {
    constructor(options = {}) {
        this.quiet = !!options.quiet;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.config = {};
        this.errors = [];
        this.warnings = [];
    }

    async prompt(question, defaultValue = '') {
        return new Promise((resolve) => {
            const displayQuestion = defaultValue
                ? `${question} (${defaultValue}): `
                : `${question}: `;

            this.rl.question(displayQuestion, (answer) => {
                resolve(answer.trim() || defaultValue);
            });
        });
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}]`;

        // Suppress non-error logs when quiet
        if (this.quiet && type !== 'error') {
            return;
        }

        switch (type) {
            case 'success':
                console.log(chalk.green(`${prefix} ✅ ${message}`));
                break;
            case 'error':
                console.log(chalk.red(`${prefix} ❌ ${message}`));
                this.errors.push(message);
                break;
            case 'warning':
                console.log(chalk.yellow(`${prefix} ⚠️  ${message}`));
                this.warnings.push(message);
                break;
            case 'info':
            default:
                console.log(chalk.blue(`${prefix} ℹ  ${message}`));
        }
    }

    async runSetup() {
        console.log(chalk.cyan('🚀 Kilocode Automation System Setup'));
        console.log(chalk.yellow('=' .repeat(40)));
        console.log('This wizard will help you configure the automation system.\n');

        try {
            // Step 1: Check Node.js version
            await this.checkNodeVersion();

            // Step 2: Install dependencies
            await this.installDependencies();

            // Step 3: Create directories
            await this.createDirectories();

            // Step 4: Configure environment
            await this.configureEnvironment();

            // Step 5: Test connections
            await this.testConnections();

            // Step 6: Run initial health check
            await this.runHealthCheck();

            // Step 7: Show summary
            this.showSummary();

        } catch (error) {
            this.log(`Setup failed: ${error.message}`, 'error');
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    async checkNodeVersion() {
        this.log('Checking Node.js version...');

        try {
            const version = process.version;
            const majorVersion = parseInt(version.substring(1).split('.')[0]);

            if (majorVersion >= 16) {
                this.log(`Node.js version: ${version} ✅`, 'success');
            } else {
                throw new Error(`Node.js ${version} is too old. Please upgrade to version 16 or higher.`);
            }
        } catch (error) {
            this.log(`Node.js version check failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async installDependencies() {
        this.log('Installing npm dependencies...');

        try {
            // Check if package.json exists
            if (!fs.existsSync('package.json')) {
                throw new Error('package.json not found. Please run this script from the project root.');
            }

            // Install dependencies
            execSync('npm install', {
                stdio: this.quiet ? 'ignore' : 'inherit'
            });

            this.log('Dependencies installed successfully', 'success');

        } catch (error) {
            this.log(`Dependency installation failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async createDirectories() {
        this.log('Creating required directories...');

        const directories = [
            'logs',
            'logs/registrations',
            'logs/batches',
            'temp',
            'temp/profiles',
            'temp/screenshots'
        ];

        try {
            directories.forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    this.log(`Created directory: ${dir}`, 'info');
                } else {
                    this.log(`Directory already exists: ${dir}`, 'info');
                }
            });

            this.log('All directories created successfully', 'success');

        } catch (error) {
            this.log(`Directory creation failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async configureEnvironment() {
        this.log('Configuring environment variables...');

        // Check if .env already exists
        if (fs.existsSync('.env')) {
            const overwrite = await this.prompt('Environment file .env already exists. Overwrite? (y/n)', 'n');
            if (overwrite.toLowerCase() !== 'y') {
                this.log('Skipping environment configuration', 'info');
                return;
            }
        }

        console.log(chalk.yellow('\n📝 Environment Configuration'));
        console.log('Please provide the following configuration values:\n');

        // Dolphin Anty Configuration
        console.log(chalk.blue('🐬 Dolphin Anty Configuration'));
        this.config.DOLPHIN_ANTY_HOST = await this.prompt('Dolphin Anty Host', 'http://localhost:3001');
        this.config.DOLPHIN_ANTY_TOKEN = await this.prompt('Dolphin Anty API Token (leave empty if not available)', '');

        // Proxy Configuration
        console.log(chalk.blue('\n🌐 Proxy Configuration (iProxy)'));
        this.config.PROXY_HOST = await this.prompt('Proxy Host', 'x305.fxdx.in');
        this.config.PROXY_PORT = await this.prompt('Proxy Port', '15874');
        this.config.PROXY_USERNAME = await this.prompt('Proxy Username', 'rejuvenatedplateau131819');
        this.config.PROXY_PASSWORD = await this.prompt('Proxy Password', 'asLuOnc1EXrm');
        this.config.PROXY_TYPE = await this.prompt('Proxy Type', 'http');

        // Captcha Service Configuration
        console.log(chalk.blue('\n🤖 Captcha Service Configuration'));
        this.config.CAPTCHA_SERVICE = await this.prompt('Captcha Service', '2captcha');
        this.config.TWOCAPTCHA_API_KEY = await this.prompt('2captcha API Key (leave empty if not available)', '');
        this.config.CAPTCHA_TIMEOUT = await this.prompt('Captcha Timeout (seconds)', '120');

        // Browser Configuration
        console.log(chalk.blue('\n🌐 Browser Configuration'));
        this.config.BROWSER_HEADLESS = await this.prompt('Run browser in headless mode? (true/false)', 'true');
        this.config.BROWSER_TIMEOUT = await this.prompt('Browser timeout (ms)', '30000');
        this.config.SLOW_MO = await this.prompt('Slow motion delay (ms)', '100');

        // Automation Settings
        console.log(chalk.blue('\n⚙️  Automation Settings'));
        this.config.MAX_RETRIES = await this.prompt('Max retries on error', '3');
        this.config.RETRY_DELAY = await this.prompt('Delay between retries (ms)', '30000');
        this.config.CONCURRENT_INSTANCES = await this.prompt('Concurrent browser instances', '1');

        // Write configuration to .env file
        await this.writeEnvironmentFile();
    }

    async writeEnvironmentFile() {
        try {
            const envContent = this.generateEnvContent();
            fs.writeFileSync('.env', envContent);
            this.log('Environment file created successfully', 'success');
        } catch (error) {
            this.log(`Failed to write environment file: ${error.message}`, 'error');
            throw error;
        }
    }

    generateEnvContent() {
        return `# Kilocode Automation Environment Configuration
# Generated by setup wizard on ${new Date().toISOString()}

# Dolphin Anty API Configuration
DOLPHIN_ANTY_HOST=${this.config.DOLPHIN_ANTY_HOST}
DOLPHIN_ANTY_TOKEN=${this.config.DOLPHIN_ANTY_TOKEN || 'your_dolphin_anty_token_here'}

# Proxy Configuration (iProxy)
PROXY_HOST=${this.config.PROXY_HOST}
PROXY_PORT=${this.config.PROXY_PORT}
PROXY_USERNAME=${this.config.PROXY_USERNAME}
PROXY_PASSWORD=${this.config.PROXY_PASSWORD}
PROXY_TYPE=${this.config.PROXY_TYPE}

# Captcha Service Configuration
CAPTCHA_SERVICE=${this.config.CAPTCHA_SERVICE}
TWOCAPTCHA_API_KEY=${this.config.TWOCAPTCHA_API_KEY || 'your_2captcha_api_key_here'}
CAPTCHA_TIMEOUT=${this.config.CAPTCHA_TIMEOUT}

# Google Account Configuration
GOOGLE_SIGNUP_DELAY_MIN=5000
GOOGLE_SIGNUP_DELAY_MAX=15000
PHONE_VERIFICATION_TIMEOUT=300
EMAIL_VERIFICATION_TIMEOUT=300

# Kilocode Configuration
KILOCODE_BASE_URL=https://kilocode.com
KILOCODE_REGISTRATION_DELAY=10000
BONUS_COLLECTION_TIMEOUT=60

# Browser Configuration
BROWSER_HEADLESS=${this.config.BROWSER_HEADLESS}
BROWSER_TIMEOUT=${this.config.BROWSER_TIMEOUT}
BROWSER_VIEWPORT_WIDTH=1366
BROWSER_VIEWPORT_HEIGHT=768
USER_DATA_DIR=./temp/profiles

# Automation Settings
MAX_RETRIES=${this.config.MAX_RETRIES}
RETRY_DELAY=${this.config.RETRY_DELAY}
CONCURRENT_INSTANCES=${this.config.CONCURRENT_INSTANCES}
REGISTRATION_BATCH_SIZE=10
COOLDOWN_BETWEEN_BATCHES=300000

# Logging Configuration
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_TO_CONSOLE=true
LOG_ROTATION_SIZE=10MB
LOG_RETENTION_DAYS=30

# Development Settings
DEBUG_MODE=false
SCREENSHOT_ON_ERROR=true
SAVE_HTML_ON_ERROR=false
SLOW_MO=${this.config.SLOW_MO}
`;
    }

    async testConnections() {
        this.log('Testing system connections...');

        try {
            // Load the new environment configuration
            require('dotenv').config({ override: true });

            // Test proxy connection
            if (this.config.PROXY_HOST && this.config.PROXY_USERNAME) {
                this.log('Testing proxy connection...', 'info');

                try {
                    const { spawn } = require('child_process');
                    const testProcess = spawn('node', ['tests/test-proxy.js'], {
                        stdio: this.quiet ? 'ignore' : 'pipe',
                        timeout: 30000
                    });

                    let output = '';
                    if (!this.quiet) {
                        testProcess.stdout.on('data', (data) => {
                            output += data.toString();
                        });
                    }

                    await new Promise((resolve, reject) => {
                        testProcess.on('close', (code) => {
                            if (code === 0) {
                                this.log('Proxy connection test passed', 'success');
                                resolve();
                            } else {
                                this.log('Proxy connection test failed', 'warning');
                                resolve(); // Don't fail setup for proxy test
                            }
                        });

                        testProcess.on('error', (error) => {
                            this.log(`Proxy test error: ${error.message}`, 'warning');
                            resolve(); // Don't fail setup for proxy test
                        });
                    });

                } catch (proxyError) {
                    this.log(`Proxy test error: ${proxyError.message}`, 'warning');
                }
            }

            // Test Dolphin Anty connection (if configured)
            if (this.config.DOLPHIN_ANTY_TOKEN && this.config.DOLPHIN_ANTY_TOKEN !== 'your_dolphin_anty_token_here') {
                this.log('Testing Dolphin Anty connection...', 'info');

                try {
                    const axios = require('axios');
                    const response = await axios.get(`${this.config.DOLPHIN_ANTY_HOST}/v1.0/browser_profiles`, {
                        headers: {
                            'Authorization': `Bearer ${this.config.DOLPHIN_ANTY_TOKEN}`
                        },
                        timeout: 10000
                    });

                    if (response.status === 200) {
                        this.log('Dolphin Anty connection test passed', 'success');
                    } else {
                        this.log('Dolphin Anty connection test failed', 'warning');
                    }

                } catch (dolphinError) {
                    this.log(`Dolphin Anty test error: ${dolphinError.message}`, 'warning');
                }
            }

        } catch (error) {
            this.log(`Connection tests failed: ${error.message}`, 'warning');
            // Don't fail setup for connection tests
        }
    }

    async runHealthCheck() {
        this.log('Running initial health check...');

        try {
            if (fs.existsSync('tests/test-environment.js')) {
                const { spawn } = require('child_process');
                const healthProcess = spawn('node', ['tests/test-environment.js'], {
                    stdio: this.quiet ? 'ignore' : 'pipe',
                    timeout: 60000
                });

                let output = '';
                if (!this.quiet) {
                    healthProcess.stdout.on('data', (data) => {
                        output += data.toString();
                    });
                }

                await new Promise((resolve, reject) => {
                    healthProcess.on('close', (code) => {
                        if (code === 0) {
                            this.log('Health check passed', 'success');
                        } else {
                            this.log('Health check completed with warnings', 'warning');
                        }
                        resolve();
                    });

                    healthProcess.on('error', (error) => {
                        this.log(`Health check error: ${error.message}`, 'warning');
                        resolve();
                    });
                });

            } else {
                this.log('Health check script not found, skipping', 'warning');
            }

        } catch (error) {
            this.log(`Health check failed: ${error.message}`, 'warning');
        }
    }

    showSummary() {
        console.log('\n' + '='.repeat(50));
        console.log(chalk.cyan('🎉 Setup Complete!'));
        console.log('='.repeat(50));

        if (this.errors.length === 0) {
            this.log('Setup completed successfully!', 'success');
            console.log('\n📋 Next Steps:');
            console.log(chalk.green('1. Review your .env configuration file'));
            console.log(chalk.green('2. Run: npm run test:proxy'));
            console.log(chalk.green('3. Run: npm run test:google'));
            console.log(chalk.green('4. Run: npm run test:kilocode'));
            console.log(chalk.green('5. Start automation: npm start'));
        } else {
            this.log('Setup completed with errors. Please review and fix:', 'warning');
            this.errors.forEach(error => {
                console.log(chalk.red(`  - ${error}`));
            });
        }

        if (this.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            this.warnings.forEach(warning => {
                console.log(chalk.yellow(`  - ${warning}`));
            });
        }

        console.log('\n📚 Documentation:');
        console.log('  - Setup Guide: docs/SETUP_GUIDE.md');
        console.log('  - Usage Guide: docs/USAGE_GUIDE.md');
        console.log('  - Troubleshooting: docs/TROUBLESHOOTING.md');

        console.log('\n🆘 Need Help?');
        console.log('  - Run tests: npm test');
        console.log('  - Health check: node scripts/health-check.js');
        console.log('  - View logs: tail -f logs/*.log');

        console.log('\n' + '='.repeat(50));
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const helpFlag = args.includes('--help') || args.includes('-h');
    const quietFlag = args.includes('--quiet') || args.includes('-q');

    if (helpFlag) {
        console.log(chalk.cyan('Kilocode Automation Setup Wizard'));
        console.log('\nUsage: node scripts/setup.js [options]');
        console.log('\nOptions:');
        console.log('  --help, -h     Show this help message');
        console.log('  --quiet, -q    Run setup with minimal output');
        console.log('\nThis script will:');
        console.log('  1. Check Node.js version requirements');
        console.log('  2. Install npm dependencies');
        console.log('  3. Create required directories');
        console.log('  4. Configure environment variables');
        console.log('  5. Test system connections');
        console.log('  6. Run health checks');
        console.log('\nRequirements:');
        console.log('  - Node.js 16 or higher');
        console.log('  - NPM package manager');
        console.log('  - Internet connection');
        console.log('  - Proxy credentials (iProxy)');
        console.log('  - Dolphin Anty installation (optional)');
        console.log('  - 2captcha API key (optional)');
        process.exit(0);
    }

    const setupWizard = new SetupWizard({ quiet: quietFlag });

    try {
        await setupWizard.runSetup();
        process.exit(0);
    } catch (error) {
        console.error(chalk.red('Setup failed:'), error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('Unhandled setup error:'), error);
        process.exit(1);
    });
}

module.exports = SetupWizard;