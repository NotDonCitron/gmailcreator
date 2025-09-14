#!/usr/bin/env node

require('dotenv').config();
const chalk = require('chalk');
const getSmsProvider = require('../src/providers/sms-provider');

(async () => {
  try {
    // Twilio provider disabled by policy; skip this test unless explicitly re-enabled
    if (process.env.ENABLE_TWILIO !== 'true') {
      console.log(chalk.yellow('⏭️  Twilio provider is disabled by policy. Skipping Twilio test.'));
      process.exit(0);
    }
    // If explicitly enabled, still avoid forcing provider and respect factory policy
    if (!process.env.SMS_PROVIDER) {
      process.env.SMS_PROVIDER = 'mock';
    }

    console.log(chalk.cyan('🧪 Testing Twilio SMS Provider (polling mode)'));
    console.log(chalk.gray('Ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_INBOUND_NUMBER are set in .env'));

    const provider = getSmsProvider();
    console.log(chalk.yellow(`Selected provider: ${provider.constructor.name}`));

    // Optional: send a diagnostics SMS if TWILIO_DIAGNOSTIC_TO is provided
    // (useful to confirm outbound capability; inbound polling is what verification uses)
    const diagTo = process.env.TWILIO_DIAGNOSTIC_TO || '';
    if (diagTo && typeof provider.sendSms === 'function') {
      try {
        const sid = await provider.sendSms({ to: diagTo, body: 'Twilio diagnostics: test message from automation.' });
        console.log(chalk.gray(`Diagnostics SMS sent to ${diagTo} (sid=${sid || 'ok'})`));
      } catch (e) {
        console.log(chalk.gray(`Diagnostics send failed: ${e.message}`));
      }
    }

    const timeoutMs = parseInt(process.env.TWILIO_POLL_TIMEOUT_MS || '10000', 10);
    console.log(chalk.gray(`Polling for inbound code for up to ${Math.round(timeoutMs / 1000)}s...`));

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
    console.error(chalk.red('💥 Twilio test error:'), err.message);
    process.exit(1);
  }
})();