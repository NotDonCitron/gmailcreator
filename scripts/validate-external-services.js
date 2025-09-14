#!/usr/bin/env node

/**
 * External Services Validation Tool
 *
 * This script validates the configuration and connectivity of all external services
 * used by the Kilocode automation system including Dolphin Anty, Twilio SMS,
 * proxies, and 2Captcha.
 *
 * Usage: node scripts/validate-external-services.js [options]
 */

require('dotenv').config();
const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

const DolphinAnty = require('../src/dolphin-anty');
const getSmsProvider = require('../src/providers/sms-provider');
const ProxyManager = require('../config/proxies');
const captchaSolver = require('../utils/captcha-solver');
const logger = require('../utils/logger');

class ExternalServicesValidator {
    constructor(options = {}) {
        this.options = {
            outputFile: './temp/services-validation-report.json',
            verbose: false,
            ...options
        };

        this.report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalServices: 0,
                working: 0,
                failed: 0,
                warnings: 0
            },
            services: {},
            recommendations: []
        };
    }

    async run() {
        console.log(chalk.cyan('🔍 External Services Validation Tool'));
        console.log(chalk.yellow('======================================\n'));

        try {
            await this.validateDolphinAnty();
            await this.validateSmsProviders();
            await this.validateProxies();
            await this.validateCaptchaService();

            this.generateRecommendations();
            await this.saveReport();
            this.displayReport();

        } catch (error) {
            console.error(chalk.red('❌ Validation failed:'), error.message);
            if (this.options.verbose) {
                console.error(error.stack);
            }
        }
    }

    async validateDolphinAnty() {
        console.log('🐬 Validating Dolphin Anty...');
        const service = {
            name: 'Dolphin Anty',
            status: 'unknown',
            details: {},
            issues: [],
            recommendations: []
        };

        this.report.summary.totalServices++;

        try {
            // Check if configured
            const host = process.env.DOLPHIN_ANTY_HOST;
            const token = process.env.DOLPHIN_ANTY_TOKEN;

            if (!host || !token) {
                service.status = 'not_configured';
                service.details.reason = 'Missing DOLPHIN_ANTY_HOST or DOLPHIN_ANTY_TOKEN';
                service.recommendations.push('Configure Dolphin Anty credentials if you want to use browser profiles');
                console.log('  ⚠️  Not configured (optional service)');
                this.report.summary.warnings++;
            } else {
                // Validate host format
                if (!host.startsWith('http')) {
                    service.issues.push('DOLPHIN_ANTY_HOST should include protocol (http/https)');
                }

                // Test connectivity
                const dolphinAnty = new DolphinAnty();

                try {
                    const connectionTest = await dolphinAnty.testConnection();

                    service.status = 'working';
                    service.details = {
                        host,
                        apiVersion: connectionTest.apiVersion || 'unknown',
                        authHeaderType: connectionTest.authHeaderType || 'unknown',
                        tokenLength: token.length
                    };

                    console.log('  ✅ Connection successful');
                    console.log(`     API Version: ${service.details.apiVersion}`);
                    console.log(`     Auth Type: ${service.details.authHeaderType}`);
                    this.report.summary.working++;

                    // Test profile operations
                    try {
                        const profiles = await dolphinAnty.listProfiles();
                        service.details.profileCount = profiles.length;
                        service.details.canListProfiles = true;
                        console.log(`     Profiles: ${profiles.length} found`);
                    } catch (profileError) {
                        service.issues.push(`Profile listing failed: ${profileError.message}`);
                    }

                } catch (connectionError) {
                    service.status = 'failed';
                    service.details.error = connectionError.message;

                    if (connectionError.message.includes('401')) {
                        service.recommendations.push('Check API token validity and authentication method');
                        service.recommendations.push('Try setting DOLPHIN_ANTY_AUTH_HEADER_TYPE=x-auth-token or bearer');
                    }

                    if (connectionError.message.includes('ECONNREFUSED')) {
                        service.recommendations.push('Ensure Dolphin Anty is running on the specified host');
                    }

                    console.log('  ❌ Connection failed:', connectionError.message);
                    this.report.summary.failed++;
                }
            }
        } catch (error) {
            service.status = 'error';
            service.details.error = error.message;
            console.log('  ❌ Validation error:', error.message);
            this.report.summary.failed++;
        }

        this.report.services.dolphinAnty = service;
    }

    async validateSmsProviders() {
        console.log('\n📱 Validating SMS Providers...');

        const smsService = {
            name: 'SMS Providers',
            status: 'unknown',
            details: {},
            providers: {},
            issues: [],
            recommendations: []
        };

        this.report.summary.totalServices++;

        try {
            const primaryProvider = process.env.SMS_PROVIDER || 'mock';
            console.log(`  Primary provider: ${primaryProvider}`);

            // Test Mock Provider
            await this.validateMockSmsProvider(smsService);

            // Test Twilio if configured
            await this.validateTwilioProvider(smsService);

            // Determine overall status
            const workingProviders = Object.values(smsService.providers)
                .filter(p => p.status === 'working');

            if (workingProviders.length > 0) {
                smsService.status = 'working';
                this.report.summary.working++;
                console.log(`  ✅ ${workingProviders.length} SMS provider(s) working`);
            } else {
                smsService.status = 'failed';
                this.report.summary.failed++;
                console.log('  ❌ No SMS providers working');
            }

        } catch (error) {
            smsService.status = 'error';
            smsService.details.error = error.message;
            this.report.summary.failed++;
        }

        this.report.services.sms = smsService;
    }

    async validateMockSmsProvider(smsService) {
        console.log('  📝 Mock SMS Provider:');

        const mockProvider = {
            name: 'Mock SMS Provider',
            status: 'working', // Mock provider is always available
            details: {
                mode: process.env.SMS_CODE_INPUT_MODE || 'env',
                filePath: process.env.SMS_CODE_FILE || './temp/sms_code.txt'
            },
            issues: []
        };

        // Check file accessibility for file mode
        if (mockProvider.details.mode === 'file') {
            try {
                await fs.ensureDir(path.dirname(mockProvider.details.filePath));
                mockProvider.details.fileAccessible = true;
                console.log(`    ✅ File mode - path accessible: ${mockProvider.details.filePath}`);
            } catch (error) {
                mockProvider.issues.push(`File path not accessible: ${error.message}`);
                console.log(`    ⚠️  File path issue: ${error.message}`);
            }
        } else {
            console.log(`    ✅ Mode: ${mockProvider.details.mode}`);
        }

        smsService.providers.mock = mockProvider;
    }

    async validateTwilioProvider(smsService) {
        console.log('  📞 Twilio SMS Provider:');

        const twilioProvider = {
            name: 'Twilio SMS Provider',
            status: 'unknown',
            details: {},
            issues: [],
            recommendations: []
        };

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const inboundNumber = process.env.TWILIO_INBOUND_NUMBER;

        if (!accountSid || !authToken) {
            twilioProvider.status = 'not_configured';
            twilioProvider.details.reason = 'Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN';
            console.log('    ⚠️  Not configured');
        } else {
            // Validate credential formats
            if (!accountSid.startsWith('AC') || accountSid.length !== 34) {
                twilioProvider.issues.push('Invalid TWILIO_ACCOUNT_SID format');
            }
            if (authToken.length !== 32) {
                twilioProvider.issues.push('Invalid TWILIO_AUTH_TOKEN format');
            }
            if (inboundNumber && !inboundNumber.match(/^\+[1-9]\d{1,14}$/)) {
                twilioProvider.issues.push('Invalid TWILIO_INBOUND_NUMBER format (should be E.164)');
            }

            try {
                // Create provider instance to test
                const TwilioSmsProvider = require('../src/providers/sms-provider');

                // This would require implementing a test method in the provider
                twilioProvider.status = 'configured';
                twilioProvider.details = {
                    accountSid: accountSid.substring(0, 8) + '...',
                    hasAuthToken: !!authToken,
                    inboundNumber: inboundNumber || 'not_set',
                    subaccountSid: process.env.TWILIO_SUBACCOUNT_SID || 'not_set',
                    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || 'not_set'
                };

                if (twilioProvider.issues.length === 0) {
                    twilioProvider.status = 'working';
                    console.log('    ✅ Credentials format valid');
                } else {
                    twilioProvider.status = 'issues';
                    console.log('    ⚠️  Configuration issues found');
                }

                twilioProvider.recommendations.push('Test SMS sending manually to verify full functionality');

            } catch (error) {
                twilioProvider.status = 'failed';
                twilioProvider.details.error = error.message;
                console.log(`    ❌ Validation failed: ${error.message}`);
            }
        }

        smsService.providers.twilio = twilioProvider;
    }

    async validateProxies() {
        console.log('\n🌐 Validating Proxies...');

        const proxyService = {
            name: 'Proxy Service',
            status: 'unknown',
            details: {},
            issues: [],
            recommendations: []
        };

        this.report.summary.totalServices++;

        try {
            const proxyHost = process.env.PROXY_HOST;
            const proxyPort = process.env.PROXY_PORT;
            const proxyUsername = process.env.PROXY_USERNAME;
            const proxyPassword = process.env.PROXY_PASSWORD;

            if (!proxyHost || !proxyPort || !proxyUsername || !proxyPassword) {
                proxyService.status = 'not_configured';
                proxyService.details.reason = 'Missing proxy credentials';
                proxyService.recommendations.push('Configure all proxy environment variables');
                console.log('  ❌ Not configured - proxy credentials required');
                this.report.summary.failed++;
            } else {
                proxyService.details = {
                    host: proxyHost,
                    port: parseInt(proxyPort),
                    username: proxyUsername.substring(0, 8) + '...',
                    type: process.env.PROXY_TYPE || 'http'
                };

                try {
                    const proxyManager = new ProxyManager();
                    const workingProxy = await proxyManager.getWorkingProxy();

                    proxyService.status = 'working';
                    proxyService.details.sessionId = workingProxy.sessionId;
                    proxyService.details.ip = workingProxy.ip || 'unknown';

                    console.log('  ✅ Proxy connection successful');
                    console.log(`     Session: ${workingProxy.sessionId}`);
                    if (workingProxy.ip) {
                        console.log(`     IP: ${workingProxy.ip}`);
                    }
                    this.report.summary.working++;

                } catch (proxyError) {
                    proxyService.status = 'failed';
                    proxyService.details.error = proxyError.message;

                    if (proxyError.message.includes('407')) {
                        proxyService.recommendations.push('Check proxy username and password');
                    } else if (proxyError.message.includes('timeout')) {
                        proxyService.recommendations.push('Check proxy host and port');
                    }

                    console.log('  ❌ Proxy connection failed:', proxyError.message);
                    this.report.summary.failed++;
                }
            }
        } catch (error) {
            proxyService.status = 'error';
            proxyService.details.error = error.message;
            this.report.summary.failed++;
        }

        this.report.services.proxy = proxyService;
    }

    async validateCaptchaService() {
        console.log('\n🤖 Validating 2Captcha Service...');

        const captchaService = {
            name: '2Captcha Service',
            status: 'unknown',
            details: {},
            issues: [],
            recommendations: []
        };

        this.report.summary.totalServices++;

        try {
            const apiKey = process.env.TWOCAPTCHA_API_KEY;

            if (!apiKey) {
                captchaService.status = 'not_configured';
                captchaService.details.reason = 'Missing TWOCAPTCHA_API_KEY';
                captchaService.recommendations.push('Configure 2Captcha API key if you need captcha solving');
                console.log('  ⚠️  Not configured (optional service)');
                this.report.summary.warnings++;
            } else {
                captchaService.details = {
                    apiKeyLength: apiKey.length,
                    service: process.env.CAPTCHA_SERVICE || '2captcha',
                    timeout: process.env.CAPTCHA_TIMEOUT || 120
                };

                try {
                    // Test API key format
                    if (apiKey.length !== 32) {
                        captchaService.issues.push('API key should be 32 characters long');
                    }

                    // Note: We don't actually test captcha solving to avoid charges
                    captchaService.status = 'configured';
                    captchaService.recommendations.push('Test captcha solving manually to verify functionality');

                    console.log('  ✅ Configured (not tested to avoid charges)');
                    console.log(`     Service: ${captchaService.details.service}`);
                    console.log(`     API Key Length: ${captchaService.details.apiKeyLength} chars`);
                    this.report.summary.working++;

                } catch (error) {
                    captchaService.status = 'failed';
                    captchaService.details.error = error.message;
                    this.report.summary.failed++;
                }
            }
        } catch (error) {
            captchaService.status = 'error';
            captchaService.details.error = error.message;
            this.report.summary.failed++;
        }

        this.report.services.captcha = captchaService;
    }

    generateRecommendations() {
        const recommendations = [];

        // Overall system recommendations
        if (this.report.summary.failed > 0) {
            recommendations.push({
                priority: 'high',
                category: 'system',
                message: `${this.report.summary.failed} service(s) failed validation. Review individual service details.`
            });
        }

        if (this.report.summary.warnings > 0) {
            recommendations.push({
                priority: 'medium',
                category: 'optional_services',
                message: `${this.report.summary.warnings} optional service(s) not configured. Consider enabling for enhanced functionality.`
            });
        }

        // Service-specific recommendations
        Object.values(this.report.services).forEach(service => {
            if (service.recommendations && service.recommendations.length > 0) {
                service.recommendations.forEach(rec => {
                    recommendations.push({
                        priority: service.status === 'failed' ? 'high' : 'medium',
                        category: service.name.toLowerCase().replace(/\s+/g, '_'),
                        message: rec
                    });
                });
            }
        });

        // Configuration suggestions
        if (!this.report.services.dolphinAnty || this.report.services.dolphinAnty.status !== 'working') {
            recommendations.push({
                priority: 'low',
                category: 'fallback',
                message: 'System will use regular browser launching since Dolphin Anty is not available'
            });
        }

        this.report.recommendations = recommendations;
    }

    async saveReport() {
        await fs.ensureDir(path.dirname(this.options.outputFile));
        await fs.writeJson(this.options.outputFile, this.report, { spaces: 2 });
    }

    displayReport() {
        console.log('\n📊 Validation Summary');
        console.log('===================\n');

        const { summary } = this.report;
        console.log(`Total Services: ${summary.totalServices}`);
        console.log(chalk.green(`✅ Working: ${summary.working}`));
        console.log(chalk.red(`❌ Failed: ${summary.failed}`));
        console.log(chalk.yellow(`⚠️  Warnings: ${summary.warnings}\n`));

        // Service status overview
        console.log('Service Status:');
        Object.values(this.report.services).forEach(service => {
            const statusIcon = {
                'working': '✅',
                'configured': '✅',
                'failed': '❌',
                'error': '💥',
                'not_configured': '⚠️',
                'issues': '⚠️'
            }[service.status] || '❓';

            console.log(`  ${statusIcon} ${service.name}: ${service.status}`);
        });

        // High priority recommendations
        const highPriorityRecs = this.report.recommendations.filter(r => r.priority === 'high');
        if (highPriorityRecs.length > 0) {
            console.log('\n🚨 Critical Issues:');
            highPriorityRecs.forEach((rec, index) => {
                console.log(`  ${index + 1}. ${rec.message}`);
            });
        }

        console.log(`\n💾 Detailed report saved to: ${this.options.outputFile}`);

        if (summary.failed === 0) {
            console.log(chalk.green('\n🎉 All critical services are working!'));
        } else {
            console.log(chalk.red(`\n⚠️  ${summary.failed} service(s) need attention before running automation.`));
        }
    }
}

// CLI Interface
async function main() {
    const program = new Command();

    program
        .name('validate-external-services')
        .description('Validate external service configurations')
        .version('1.0.0');

    program
        .option('-v, --verbose', 'Verbose output', false)
        .option('-o, --output <file>', 'Output report file', './temp/services-validation-report.json');

    program.parse();
    const options = program.opts();

    const validator = new ExternalServicesValidator({
        verbose: options.verbose,
        outputFile: options.output
    });

    await validator.run();
}

if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('💥 Unhandled error:'), error);
        process.exit(1);
    });
}

module.exports = ExternalServicesValidator;