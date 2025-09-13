#!/usr/bin/env node

// Simple test for the Mock SMS provider free/manual flow.
// This verifies that the provider can retrieve a code from ENV/FILE/PROMPT without paid services.

const chalk = require('chalk');
const getSmsProvider = require('../src/providers/sms-provider');

(async () => {
  try {
    console.log(chalk.cyan('🧪 Testing Mock SMS Provider'));

    // Timeout short for test
    const timeoutMs = 5000;

    // Show current mode for clarity
    const provider = getSmsProvider();
    console.log(chalk.yellow(`Provider: mock, Mode: ${process.env.SMS_CODE_INPUT_MODE || 'env'} (override with SMS_CODE_INPUT_MODE)`));

    const start = Date.now();
    const code = await provider.waitForCode({ timeoutMs });
    const dur = Date.now() - start;

    if (code) {
      console.log(chalk.green(`✅ Code received: ${code} (in ${dur}ms)`));
      process.exit(0);
    } else {
      console.log(chalk.red(`❌ No code received within ${timeoutMs}ms`));
      process.exit(1);
    }
  } catch (err) {
    console.error(chalk.red('💥 Test error:'), err.message);
    process.exit(1);
  }
})();