# Kilocode Automation System - Usage Guide

This guide explains how to operate the Kilocode automation system effectively and safely.

## Table of Contents

- [Quick Start](#quick-start)
- [Command Line Interface](#command-line-interface)
- [Operation Modes](#operation-modes)
- [Configuration Options](#configuration-options)
- [Monitoring and Logging](#monitoring-and-logging)
- [Batch Operations](#batch-operations)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

## Quick Start

### Basic Commands

```bash
# Start automation with default settings
npm start

# Create a single account
npm start -- --count 1

# Run in test mode (safer)
npm start -- --test-mode

# Show help
npm start -- --help
```

### First Time Usage

1. **Health Check**: Always verify system health before starting
   ```bash
   node scripts/health-check.js
   ```

2. **Dry Run**: Test your configuration without creating accounts
   ```bash
   DRY_RUN=true npm start
   ```

3. **Single Test**: Create one account to verify everything works
   ```bash
   npm start -- --count 1 --test-mode
   ```

## Command Line Interface

### Main Application

```bash
node src/main.js [options]
# Or using npm script:
npm start -- [options]
```

### Available Options

| Option | Description | Default |
|--------|-------------|---------|
| `--count <n>` | Number of accounts to create | 10 |
| `--batch-size <n>` | Accounts per batch | 10 |
| `--concurrent <n>` | Parallel browser instances | 1 |
| `--delay <ms>` | Delay between accounts | 30000 |
| `--test-mode` | Enable test mode with extra validation | false |
| `--headless` | Run browsers in headless mode | true |
| `--no-cleanup` | Skip profile cleanup after completion | false |
| `--proxy-rotation` | Force proxy rotation for each account | false |
| `--help` | Show help information | - |

### Examples

```bash
# Create 5 accounts in test mode
npm start -- --count 5 --test-mode

# Batch of 20 accounts with 2 concurrent browsers
npm start -- --count 20 --batch-size 10 --concurrent 2

# Visible browser mode with longer delays
npm start -- --headless false --delay 60000

# Force proxy rotation for each account
npm start -- --proxy-rotation --count 10
```

## Operation Modes

### 1. Production Mode (Default)

Full automation with all features enabled:
```bash
npm start
```

**Features:**
- Creates real Google accounts
- Registers with Kilocode
- Collects bonuses
- Full error handling and retry logic

### 2. Test Mode

Safer mode with additional validation:
```bash
npm start -- --test-mode
```

**Features:**
- Extra verification steps
- Detailed logging
- Safer error handling
- Account validation after creation

### 3. Dry Run Mode

Simulates the workflow without creating accounts:
```bash
DRY_RUN=true npm start
```

**Features:**
- No real account creation
- Tests all system components
- Validates configuration
- Safe for testing changes

### 4. Debug Mode

Enhanced logging and visible browsers:
```bash
DEBUG_MODE=true BROWSER_HEADLESS=false npm start
```

**Features:**
- Detailed debug output
- Visible browser windows
- Step-by-step logging
- Error screenshots

## Configuration Options

### Environment Variables

Configure operation through `.env` file or environment variables:

```bash
# Core Settings
REGISTRATION_BATCH_SIZE=10          # Accounts per batch
CONCURRENT_INSTANCES=1              # Parallel browsers
MAX_RETRIES=3                      # Retry attempts

# Timing Settings
GOOGLE_SIGNUP_DELAY_MIN=5000       # Min delay for Google signup
GOOGLE_SIGNUP_DELAY_MAX=15000      # Max delay for Google signup
KILOCODE_REGISTRATION_DELAY=10000  # Delay for Kilocode registration
COOLDOWN_BETWEEN_BATCHES=300000    # 5-minute cooldown

# Browser Settings
BROWSER_HEADLESS=true              # Headless mode
BROWSER_TIMEOUT=30000              # Page timeout
SLOW_MO=100                        # Action delay

# Debug Settings
DEBUG_MODE=false                   # Debug logging
SCREENSHOT_ON_ERROR=true           # Screenshots on failure
SAVE_HTML_ON_ERROR=false           # Save page HTML on error
```

### SMS Provider Policy (No-Twilio)

- Twilio is disabled by policy for OTP/verification flows. Do not use Twilio (VoIP/virtual numbers) for Google OTP.
- Allowed providers:
  - mock: for manual/dry testing (ENV/file/prompt input).
  - onlinesim: placeholder name; not implemented in this build, will fall back to mock with a warning.
- Blacklist: own/personal numbers and any explicitly disallowed MSISDNs must not be used. Configure via:
  - .env → SMS_BLACKLIST=+491732114133
  - You may comma-separate multiple numbers.
- Runtime normalization blocks Twilio even if SMS_PROVIDER=twilio is set; it is coerced to mock internally.
- Files impacted:
  - Provider factory and normalization: [src.providers.sms-provider.getSmsProvider()](src/providers/sms-provider.js:304)
  - Settings (provider normalization and blacklist): [config.settings.sms](config/settings.js:150)
  - Google phone step blacklist enforcement: [src.google-account.handlePhoneVerification()](src/google-account.js:374)

Usage for manual code entry
- File mode (recommended for automation):
  - Set SMS_PROVIDER=mock and SMS_CODE_INPUT_MODE=file in .env
  - Write OTP digits to ./temp/sms_code.txt when prompted; provider will auto-detect and clear.
- Prompt mode (interactive):
  - Set SMS_CODE_INPUT_MODE=prompt, paste digits at the terminal prompt.
- ENV mode (one-off invocation):
  - node -e "process.env.SMS_CODE='123456'; process.env.SMS_CODE_INPUT_MODE='env'; require('./scripts/test-twilio.js')"

Security note
- Do NOT commit real phone numbers, Twilio credentials, or OTPs to source control.
- Avoid using personal numbers; the project enforces blacklisting for known personal MSISDNs by default.

### Runtime Configuration

Override settings at runtime:
```bash
# Change batch size for this run
REGISTRATION_BATCH_SIZE=5 npm start

# Run with visible browsers
BROWSER_HEADLESS=false npm start

# Enable debug mode
DEBUG_MODE=true npm start
```

## Monitoring and Logging

### Log Files

The system creates detailed logs in the `logs/` directory:

```
logs/
├── automation.log              # Main application log
├── error.log                   # Error details
├── registrations/
│   ├── successful_YYYYMMDD.log # Successful registrations
│   └── failed_YYYYMMDD.log     # Failed attempts
└── batches/
    └── batch_summary_ID.json   # Batch summaries
```

### Real-time Monitoring

Monitor progress during operation:

```bash
# Follow main log
tail -f logs/automation.log

# Monitor errors
tail -f logs/error.log

# Watch successful registrations
tail -f logs/registrations/successful_$(date +%Y%m%d).log
```

### Health Monitoring

Check system health periodically:
```bash
# Basic health check
node scripts/health-check.js

# Detailed health report
node scripts/health-check.js --json > health-report.json

# Continuous monitoring (every 5 minutes)
watch -n 300 node scripts/health-check.js
```

## Batch Operations

### Understanding Batches

The system processes accounts in batches for efficiency and stability:

- **Batch Size**: Number of accounts per batch (configurable)
- **Cooldown**: Delay between batches to avoid rate limiting
- **Parallel Processing**: Multiple browsers within a batch

### Batch Configuration

```bash
# Large batch with more parallel processing
npm start -- --batch-size 20 --concurrent 3

# Small batches with longer cooldowns
REGISTRATION_BATCH_SIZE=5 COOLDOWN_BETWEEN_BATCHES=600000 npm start
```

### Batch Monitoring

Each batch generates a summary file:
```json
{
  "batchId": "batch_1234567890123",
  "startTime": "2024-01-01T10:00:00.000Z",
  "endTime": "2024-01-01T10:15:30.000Z",
  "totalAccounts": 10,
  "successful": 8,
  "failed": 2,
  "accounts": [
    {
      "email": "user1@gmail.com",
      "status": "completed",
      "kilocodeApiKey": "abc123..."
    }
  ]
}
```

## Error Handling

### Automatic Recovery

The system includes robust error handling:

- **Retry Logic**: Automatic retries on transient failures
- **Proxy Rotation**: Switch proxies on connection issues
- **Profile Cleanup**: Clean up failed profiles automatically
- **Graceful Degradation**: Continue with other accounts if one fails

### Manual Recovery

If automation stops unexpectedly:

1. **Check Logs**: Review error logs for the cause
2. **Health Check**: Verify system components
3. **Resume**: Restart with remaining accounts
4. **Cleanup**: Run cleanup script if needed

```bash
# Check what went wrong
tail -100 logs/error.log

# Verify system health
node scripts/health-check.js

# Clean up any stuck processes
node scripts/cleanup.js

# Resume with remaining accounts
npm start -- --count <remaining_count>
```

### Common Error Scenarios

**Proxy Issues:**
```bash
# Test proxy connectivity
npm run test:proxy

# Try with different proxy settings
PROXY_HOST=backup-proxy.com npm start
```

**Browser Issues:**
```bash
# Clear browser profiles
rm -rf temp/profiles/*

# Run with visible browser for debugging
BROWSER_HEADLESS=false npm start -- --count 1
```

**Dolphin Anty Issues:**
```bash
# Test Dolphin Anty connection
curl -H "Authorization: Bearer $DOLPHIN_ANTY_TOKEN" \
     $DOLPHIN_ANTY_HOST/v1.0/browser_profiles
```

## Best Practices

### Performance Optimization

1. **Start Small**: Begin with small batches and increase gradually
2. **Monitor Resources**: Watch CPU and memory usage
3. **Use Headless Mode**: Run browsers headless for better performance
4. **Limit Concurrency**: Don't exceed your system capabilities

```bash
# Good for most systems
npm start -- --batch-size 10 --concurrent 2

# For powerful systems
npm start -- --batch-size 20 --concurrent 4
```

### Reliability Practices

1. **Regular Health Checks**: Monitor system health
2. **Log Monitoring**: Watch for patterns in errors
3. **Proxy Rotation**: Ensure proxy health
4. **Account Validation**: Verify created accounts work

```bash
# Daily health check
node scripts/health-check.js

# Weekly cleanup
node scripts/cleanup.js

# Monitor proxy health
npm run test:proxy
```

### Security Practices

1. **Secure Configuration**: Protect sensitive credentials
2. **Log Rotation**: Prevent log files from growing too large
3. **Profile Cleanup**: Remove temporary data regularly
4. **Access Control**: Limit system access

```bash
# Secure .env file permissions
chmod 600 .env

# Regular cleanup
node scripts/cleanup.js --force

# Rotate logs
node scripts/cleanup.js --logs-only
```

### Scaling Considerations

**Single Machine Scaling:**
```bash
# Increase parallel processing
npm start -- --concurrent 4 --batch-size 20

# Run multiple instances with different configs
PROXY_SESSION_OFFSET=0 npm start &
PROXY_SESSION_OFFSET=10 npm start &
```

**Multi-Machine Scaling:**
- Deploy on multiple servers
- Use different proxy endpoints
- Coordinate through shared logging
- Load balance account creation targets

## Troubleshooting Quick Reference

| Issue | Quick Fix |
|-------|-----------|
| Proxy connection failed | `npm run test:proxy` |
| Browser won't start | `rm -rf temp/profiles/*` |
| Dolphin Anty error | Check if application is running |
| High memory usage | Reduce `--concurrent` value |
| Accounts failing | Enable `--test-mode` |
| Rate limiting | Increase delays in `.env` |

## Advanced Usage

### Custom Workflows

Create custom automation scripts:
```javascript
const AutomationMain = require('./src/main');

const automation = new AutomationMain();

// Custom batch with specific settings
await automation.runBatch({
  size: 5,
  concurrent: 1,
  testMode: true
});
```

### Integration with Other Tools

Export account data for external use:
```bash
# Export successful accounts
cat logs/registrations/successful_*.log | jq '.email' > accounts.txt
```

### Monitoring Integration

Set up alerting for production environments:
```bash
# Check status and alert if critical
STATUS=$(node scripts/health-check.js --json | jq -r '.overall')
if [ "$STATUS" = "critical" ]; then
    echo "System critical!" | mail -s "Automation Alert" admin@example.com
fi
```

---

**Happy Automating!** 🚀

For more detailed information, see:
- [API Reference](API_REFERENCE.md) for programmatic usage
- [Troubleshooting Guide](TROUBLESHOOTING.md) for solving problems
- [Deployment Guide](DEPLOYMENT.md) for production setup
- [Testing Guide](../TESTING.md) for test strategy and commands