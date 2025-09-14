#!/usr/bin/env node

/**
 * Quick test for OnlineSim.io SMS provider
 * Usage: node scripts/test-onlinesim.js
 * Requires: ONLINESIM_API_KEY environment variable
 */

require('dotenv').config();
const chalk = require('chalk');
const OnlineSimSmsProvider = require('../src/providers/onlinesim-provider');

(async () => {
  try {
    console.log(chalk.cyan('🧪 Testing OnlineSim.io SMS Provider'));
    
    const provider = new OnlineSimSmsProvider();
    
    console.log(chalk.yellow('Starting verification flow...'));
    console.log(chalk.gray('This will purchase a number and poll for SMS'));
    
    const code = await provider.waitForCode({ timeoutMs: 120000 });
    
    if (code) {
      console.log(chalk.green(`✅ SMS code received: ${code}`));
      process.exit(0);
    } else {
      console.log(chalk.red('❌ No code received within timeout'));
      process.exit(1);
    }
  } catch (err) {
    console.error(chalk.red('💥 OnlineSim test error:'), err.message);
    process.exit(1);
  }
})();