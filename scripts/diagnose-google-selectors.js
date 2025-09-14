#!/usr/bin/env node

/**
 * Google Selector Diagnostic Tool
 *
 * This script navigates to the Google signup page and analyzes the current
 * form structure to identify up-to-date selectors for the automation system.
 *
 * Usage: node scripts/diagnose-google-selectors.js [options]
 */

require('dotenv').config();
const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

const StealthBrowser = require('../src/stealth-browser');
const logger = require('../utils/logger');

class GoogleSelectorDiagnostic {
    constructor(options = {}) {
        this.options = {
            headless: false,
            debug: true,
            outputFile: './temp/google-selectors-analysis.json',
            ...options
        };

        this.stealthBrowser = new StealthBrowser();
        this.analysis = {
            timestamp: new Date().toISOString(),
            url: '',
            title: '',
            flowSteps: [],
            selectors: {
                names: [],
                username: [],
                password: [],
                confirmPassword: [],
                personalInfo: {
                    month: [],
                    day: [],
                    year: [],
                    gender: []
                },
                buttons: []
            },
            recommendations: []
        };
    }

    async run() {
        let browser = null;

        try {
            console.log(chalk.cyan('🔍 Google Selector Diagnostic Tool'));
            console.log(chalk.yellow('====================================\n'));

            // Launch stealth browser
            console.log('🚀 Launching browser...');
            browser = await this.stealthBrowser.launch(null, {
                headless: this.options.headless,
                debug: this.options.debug
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });

            // Step 1: Navigate to Google signup
            console.log('🌐 Navigating to Google signup page...');
            const signupUrl = process.env.GOOGLE_SIGNUP_URL_OVERRIDE ||
                             'https://accounts.google.com/signup/v2/webcreateaccount?hl=en&flowName=GlifWebSignIn&flowEntry=SignUp';

            await page.goto(signupUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            this.analysis.url = page.url();
            this.analysis.title = await page.title();

            console.log(`📄 Page loaded: ${this.analysis.title}`);
            console.log(`🔗 URL: ${this.analysis.url}`);

            // Step 2: Analyze the current form structure
            await this.analyzeFormStructure(page);

            // Step 3: Test form interaction flow
            await this.testFormFlow(page);

            // Step 4: Generate recommendations
            this.generateRecommendations();

            // Step 5: Save analysis
            await this.saveAnalysis();

            // Step 6: Display results
            this.displayResults();

        } catch (error) {
            console.error(chalk.red('❌ Diagnostic failed:'), error.message);
            if (this.options.debug) {
                console.error(error.stack);
            }
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    async analyzeFormStructure(page) {
        console.log('\n🔍 Analyzing form structure...');

        // Wait for page to fully load
        await page.waitForTimeout(3000);

        // Capture all input fields
        const inputFields = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input')).map(input => ({
                tagName: input.tagName.toLowerCase(),
                type: input.type,
                name: input.name,
                id: input.id,
                placeholder: input.placeholder,
                ariaLabel: input.getAttribute('aria-label'),
                autocomplete: input.autocomplete,
                className: input.className,
                visible: input.offsetParent !== null,
                value: input.value,
                required: input.required,
                jscontroller: input.getAttribute('jscontroller'),
                jsname: input.getAttribute('jsname'),
                dataInitialValue: input.getAttribute('data-initial-value')
            }));
        });

        // Capture all buttons and clickable elements
        const buttons = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button, [role="button"], div[jsname]')).map(btn => ({
                tagName: btn.tagName.toLowerCase(),
                type: btn.type,
                role: btn.getAttribute('role'),
                text: (btn.innerText || btn.textContent || '').trim(),
                ariaLabel: btn.getAttribute('aria-label'),
                className: btn.className,
                jsname: btn.getAttribute('jsname'),
                jscontroller: btn.getAttribute('jscontroller'),
                visible: btn.offsetParent !== null,
                id: btn.id
            }));
        });

        // Capture select elements and comboboxes
        const selects = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('select, [role="combobox"]')).map(select => ({
                tagName: select.tagName.toLowerCase(),
                role: select.getAttribute('role'),
                name: select.name,
                id: select.id,
                ariaLabel: select.getAttribute('aria-label'),
                className: select.className,
                visible: select.offsetParent !== null
            }));
        });

        // Categorize input fields
        this.categorizeInputFields(inputFields);
        this.categorizeButtons(buttons);
        this.categorizeSelects(selects);

        console.log(`📝 Found ${inputFields.length} input fields`);
        console.log(`🔘 Found ${buttons.length} buttons/clickable elements`);
        console.log(`📋 Found ${selects.length} select/combobox elements`);

        // Store raw data for analysis
        this.analysis.rawData = {
            inputFields,
            buttons,
            selects
        };
    }

    categorizeInputFields(inputFields) {
        inputFields.forEach(field => {
            if (!field.visible) return;

            const ariaLabel = (field.ariaLabel || '').toLowerCase();
            const placeholder = (field.placeholder || '').toLowerCase();
            const name = (field.name || '').toLowerCase();
            const id = (field.id || '').toLowerCase();

            // Name fields
            if (ariaLabel.includes('first name') || name.includes('firstname') || id.includes('firstname')) {
                this.analysis.selectors.names.push({
                    type: 'firstName',
                    selector: this.buildSelector(field),
                    confidence: 'high',
                    field
                });
            }
            if (ariaLabel.includes('last name') || name.includes('lastname') || id.includes('lastname')) {
                this.analysis.selectors.names.push({
                    type: 'lastName',
                    selector: this.buildSelector(field),
                    confidence: 'high',
                    field
                });
            }

            // Username fields
            if (ariaLabel.includes('username') || ariaLabel.includes('gmail') ||
                name.includes('username') || id.includes('username') ||
                placeholder.includes('username') || placeholder.includes('choose')) {
                this.analysis.selectors.username.push({
                    selector: this.buildSelector(field),
                    confidence: this.calculateConfidence(field, 'username'),
                    field
                });
            }

            // Password fields
            if (field.type === 'password') {
                if (ariaLabel.includes('confirm') || name.includes('confirm') ||
                    placeholder.includes('confirm') || ariaLabel.includes('re-enter')) {
                    this.analysis.selectors.confirmPassword.push({
                        selector: this.buildSelector(field),
                        confidence: this.calculateConfidence(field, 'confirmPassword'),
                        field
                    });
                } else {
                    this.analysis.selectors.password.push({
                        selector: this.buildSelector(field),
                        confidence: this.calculateConfidence(field, 'password'),
                        field
                    });
                }
            }

            // Personal info fields
            if (field.type === 'number' || ariaLabel.includes('day') || name.includes('day')) {
                this.analysis.selectors.personalInfo.day.push({
                    selector: this.buildSelector(field),
                    confidence: this.calculateConfidence(field, 'day'),
                    field
                });
            }
            if (field.type === 'number' || ariaLabel.includes('year') || name.includes('year')) {
                this.analysis.selectors.personalInfo.year.push({
                    selector: this.buildSelector(field),
                    confidence: this.calculateConfidence(field, 'year'),
                    field
                });
            }
        });
    }

    categorizeButtons(buttons) {
        buttons.forEach(button => {
            if (!button.visible) return;

            const text = button.text.toLowerCase();
            const ariaLabel = (button.ariaLabel || '').toLowerCase();

            if (text.includes('next') || ariaLabel.includes('next') ||
                text.includes('continue') || button.jsname === 'LgbsSe') {
                this.analysis.selectors.buttons.push({
                    type: 'next',
                    selector: this.buildButtonSelector(button),
                    confidence: this.calculateButtonConfidence(button, 'next'),
                    button
                });
            }

            if (text.includes('create') || text.includes('sign up') ||
                text.includes('register') || ariaLabel.includes('create')) {
                this.analysis.selectors.buttons.push({
                    type: 'create',
                    selector: this.buildButtonSelector(button),
                    confidence: this.calculateButtonConfidence(button, 'create'),
                    button
                });
            }
        });
    }

    categorizeSelects(selects) {
        selects.forEach(select => {
            if (!select.visible) return;

            const ariaLabel = (select.ariaLabel || '').toLowerCase();
            const name = (select.name || '').toLowerCase();

            if (ariaLabel.includes('month') || name.includes('month')) {
                this.analysis.selectors.personalInfo.month.push({
                    selector: this.buildSelector(select),
                    confidence: this.calculateConfidence(select, 'month'),
                    field: select
                });
            }

            if (ariaLabel.includes('gender') || name.includes('gender')) {
                this.analysis.selectors.personalInfo.gender.push({
                    selector: this.buildSelector(select),
                    confidence: this.calculateConfidence(select, 'gender'),
                    field: select
                });
            }
        });
    }

    buildSelector(field) {
        const selectors = [];

        if (field.id) selectors.push(`#${field.id}`);
        if (field.name) selectors.push(`[name="${field.name}"]`);
        if (field.ariaLabel) selectors.push(`[aria-label*="${field.ariaLabel}"]`);
        if (field.jscontroller && field.type) selectors.push(`input[jscontroller][type="${field.type}"]`);
        if (field.autocomplete) selectors.push(`input[autocomplete="${field.autocomplete}"]`);

        return selectors;
    }

    buildButtonSelector(button) {
        const selectors = [];

        if (button.id) selectors.push(`#${button.id}`);
        if (button.jsname) selectors.push(`[jsname="${button.jsname}"]`);
        if (button.ariaLabel) selectors.push(`[aria-label="${button.ariaLabel}"]`);
        if (button.role) selectors.push(`[role="${button.role}"]`);
        if (button.tagName === 'button') selectors.push('button');

        return selectors;
    }

    calculateConfidence(field, type) {
        let score = 0;

        // ID match gives highest confidence
        if (field.id && field.id.toLowerCase().includes(type)) score += 50;

        // Name attribute match
        if (field.name && field.name.toLowerCase().includes(type)) score += 40;

        // Aria-label match
        if (field.ariaLabel && field.ariaLabel.toLowerCase().includes(type)) score += 30;

        // Placeholder match
        if (field.placeholder && field.placeholder.toLowerCase().includes(type)) score += 20;

        // Type-specific bonuses
        if (type === 'password' && field.type === 'password') score += 40;
        if (type.includes('day') && field.type === 'number') score += 20;
        if (type.includes('year') && field.type === 'number') score += 20;

        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    }

    calculateButtonConfidence(button, type) {
        let score = 0;

        const text = button.text.toLowerCase();
        const ariaLabel = (button.ariaLabel || '').toLowerCase();

        // Direct text match
        if (text.includes(type)) score += 50;

        // Aria-label match
        if (ariaLabel.includes(type)) score += 40;

        // JSName matches (Google-specific)
        if (type === 'next' && button.jsname === 'LgbsSe') score += 60;

        // Button type
        if (button.tagName === 'button') score += 20;

        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    }

    async testFormFlow(page) {
        console.log('\n🧪 Testing form interaction flow...');

        const flowStep = {
            step: 'initial',
            url: page.url(),
            visibleFields: [],
            interactions: []
        };

        // Test name field filling
        const firstNameCandidates = this.analysis.selectors.names
            .filter(s => s.type === 'firstName' && s.confidence === 'high');

        if (firstNameCandidates.length > 0) {
            try {
                const selector = firstNameCandidates[0].selector[0];
                await page.waitForSelector(selector, { timeout: 5000 });
                await page.type(selector, 'Test');
                flowStep.interactions.push(`Successfully filled first name with: ${selector}`);
                console.log(`✅ First name field works: ${selector}`);
            } catch (error) {
                flowStep.interactions.push(`Failed to interact with first name field: ${error.message}`);
                console.log(`❌ First name field failed: ${error.message}`);
            }
        }

        this.analysis.flowSteps.push(flowStep);
    }

    generateRecommendations() {
        console.log('\n💡 Generating recommendations...');

        const recommendations = [];

        // Username field recommendations
        const highConfidenceUsername = this.analysis.selectors.username
            .filter(s => s.confidence === 'high');

        if (highConfidenceUsername.length > 0) {
            const selectors = highConfidenceUsername.map(s => s.selector).flat();
            recommendations.push({
                type: 'username',
                recommendation: 'Update usernameCandidates array',
                selectors: [...new Set(selectors)],
                confidence: 'high'
            });
        } else {
            recommendations.push({
                type: 'username',
                recommendation: 'No high-confidence username selectors found - manual review required',
                confidence: 'low'
            });
        }

        // Password field recommendations
        const highConfidencePassword = this.analysis.selectors.password
            .filter(s => s.confidence === 'high');

        if (highConfidencePassword.length > 0) {
            const selectors = highConfidencePassword.map(s => s.selector).flat();
            recommendations.push({
                type: 'password',
                recommendation: 'Update pwdCandidates array',
                selectors: [...new Set(selectors)],
                confidence: 'high'
            });
        }

        // Button recommendations
        const nextButtons = this.analysis.selectors.buttons
            .filter(s => s.type === 'next' && s.confidence === 'high');

        if (nextButtons.length > 0) {
            const selectors = nextButtons.map(s => s.selector).flat();
            recommendations.push({
                type: 'buttons',
                recommendation: 'Update possibleNexts array',
                selectors: [...new Set(selectors)],
                confidence: 'high'
            });
        }

        this.analysis.recommendations = recommendations;
    }

    async saveAnalysis() {
        await fs.ensureDir(path.dirname(this.options.outputFile));
        await fs.writeJson(this.options.outputFile, this.analysis, { spaces: 2 });
        console.log(`\n💾 Analysis saved to: ${this.options.outputFile}`);
    }

    displayResults() {
        console.log('\n📊 Diagnostic Results');
        console.log('=====================\n');

        // Display recommendations
        this.analysis.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. ${chalk.yellow(rec.type.toUpperCase())} - ${chalk.cyan(rec.confidence)} confidence`);
            console.log(`   ${rec.recommendation}`);
            if (rec.selectors) {
                console.log(`   Suggested selectors:`);
                rec.selectors.slice(0, 5).forEach(selector => {
                    console.log(`     - ${chalk.green(selector)}`);
                });
                if (rec.selectors.length > 5) {
                    console.log(`     ... and ${rec.selectors.length - 5} more`);
                }
            }
            console.log('');
        });

        console.log(chalk.green('✅ Diagnostic completed successfully!'));
        console.log(`📄 Detailed analysis available in: ${this.options.outputFile}`);
    }
}

// CLI Interface
async function main() {
    const program = new Command();

    program
        .name('diagnose-google-selectors')
        .description('Analyze Google signup page selectors')
        .version('1.0.0');

    program
        .option('--headless', 'Run browser in headless mode', false)
        .option('--no-debug', 'Disable debug mode', false)
        .option('-o, --output <file>', 'Output file path', './temp/google-selectors-analysis.json');

    program.parse();
    const options = program.opts();

    const diagnostic = new GoogleSelectorDiagnostic({
        headless: options.headless,
        debug: !options.noDebug,
        outputFile: options.output
    });

    await diagnostic.run();
}

if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('💥 Unhandled error:'), error);
        process.exit(1);
    });
}

module.exports = GoogleSelectorDiagnostic;