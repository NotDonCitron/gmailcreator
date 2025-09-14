# Kilocode Automation System - Setup Guide

This comprehensive guide will walk you through the complete installation and configuration of the Kilocode automation system.

## Table of Contents

- [System Requirements](#system-requirements)
- [Prerequisites Installation](#prerequisites-installation)
- [Project Setup](#project-setup)
- [Configuration](#configuration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## System Requirements

### Minimum Requirements
- **Operating System**: Windows 10/11, macOS 10.15+, or Ubuntu 18.04+
- **Node.js**: Version 16.0 or higher
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space minimum
- **Internet**: Stable broadband connection

### Recommended System
- **CPU**: Multi-core processor (Intel i5 or AMD equivalent)
- **RAM**: 8GB or more
- **Storage**: SSD with 5GB+ free space
- **Internet**: High-speed connection with low latency

## Prerequisites Installation

### 1. Node.js Installation

**Windows:**
1. Download Node.js from [nodejs.org](https://nodejs.org/)
2. Run the installer and follow the setup wizard
3. Verify installation:
   ```cmd
   node --version
   npm --version
   ```

**macOS:**
```bash
# Using Homebrew
brew install node

# Or download from nodejs.org
```

**Linux (Ubuntu/Debian):**
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Dolphin Anty Browser Installation

Dolphin Anty is required for advanced browser fingerprinting and profile management.

1. **Download Dolphin Anty**
   - Visit [dolphin-anty.com](https://dolphin-anty.com/)
   - Create an account and download the application
   - Install following the platform-specific instructions

2. **Configure Dolphin Anty**
   - Launch Dolphin Anty
   - Create a workspace if prompted
   - Enable API access in Settings → API
   - Note down your API token and local server URL (usually `http://localhost:3001`)

### 3. Proxy Service Setup (iProxy)

The system requires a rotating proxy service for IP management.

1. **Create iProxy Account**
   - Visit your proxy provider
   - Purchase a rotating proxy package
   - Note down your credentials

2. **Test Proxy Connection**
   ```bash
   curl -x http://username:password@proxy-host:port https://httpbin.org/ip
   ```

### 4. Captcha Service Setup (Optional)

For automated captcha solving, configure 2captcha service.

1. **Create 2captcha Account**
   - Register at [2captcha.com](https://2captcha.com/)
   - Add funds to your account
   - Get your API key from the dashboard

## Project Setup

### 1. Download Project Files

Extract the project files to your desired location:
```bash
cd /path/to/your/projects
# Extract the project archive here
cd kilocode-automation
```

### 2. Automated Setup (Recommended)

Run the automated setup wizard:

```bash
# Run the setup wizard
node scripts/setup.js
```

The setup wizard will:
- Check Node.js version
- Install dependencies
- Create necessary directories
- Guide you through configuration
- Test system connections
- Run health checks

### 3. Manual Setup (Advanced Users)

If you prefer manual setup:

```bash
# Install dependencies
npm install

# Create directories
mkdir -p logs/registrations logs/batches temp/profiles temp/screenshots

# Copy environment template
cp .env.example .env

# Edit configuration (see Configuration section below)
```

## Configuration

### Environment Variables

Edit the `.env` file with your specific settings:

```bash
# Dolphin Anty Configuration
DOLPHIN_ANTY_HOST=http://localhost:3001
DOLPHIN_ANTY_TOKEN=your_actual_token_here

# Proxy Configuration
PROXY_HOST=your-proxy-host.com
PROXY_PORT=port_number
PROXY_USERNAME=your_proxy_username
PROXY_PASSWORD=your_proxy_password
PROXY_TYPE=http

# Captcha Service (Optional)
CAPTCHA_SERVICE=2captcha
TWOCAPTCHA_API_KEY=your_2captcha_api_key

# Browser Settings
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
SLOW_MO=100

# Automation Settings
MAX_RETRIES=3
CONCURRENT_INSTANCES=1
REGISTRATION_BATCH_SIZE=10
```

### SMS / Phone Verification Provider

- Default: Mock provider for free/manual testing. No Twilio required; supports env/file/prompt code ingestion.
  - To use: set `SMS_PROVIDER=mock`, then choose one:
    - `SMS_CODE_INPUT_MODE=env` and set `SMS_CODE=123456` at runtime,
    - `SMS_CODE_INPUT_MODE=file` and write the code to `SMS_CODE_FILE` (e.g., `./temp/sms_code.txt`),
    - `SMS_CODE_INPUT_MODE=prompt` to type the code in the terminal.
- Twilio (Polling): Polls Twilio’s Messages API for inbound SMS to your configured number. Webhooks are optional.
  - To enable: set `SMS_PROVIDER=twilio` and provide `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_INBOUND_NUMBER` (SMS-capable).
  - Trial constraints: Inbound testing may be blocked on trial plans and when the number is not owned by the same project/subaccount. Use the Mock provider until you have either a subaccount SID + token that owns your number or a fully-capable number in the main project.

### Configuration Details

**Dolphin Anty Settings:**
- `DOLPHIN_ANTY_HOST`: Usually `http://localhost:3001`
- `DOLPHIN_ANTY_TOKEN`: API token from Dolphin Anty settings

**Proxy Settings:**
- Configure your rotating proxy credentials
- Test connection before proceeding

**Browser Settings:**
- `BROWSER_HEADLESS=false`: Show browser windows (useful for debugging)
- `SLOW_MO`: Add delays between actions (0-1000ms)

**Automation Settings:**
- `MAX_RETRIES`: Number of retry attempts on failure
- `CONCURRENT_INSTANCES`: How many browsers to run simultaneously
- `REGISTRATION_BATCH_SIZE`: Accounts per batch

## Testing

### 1. Environment Test

Verify your setup:
```bash
node tests/test-environment.js
```

This test checks:
- Node.js version compatibility
- Environment variables
- Dependencies installation
- File system permissions
- Service connectivity

### 2. Individual Component Tests

Test each component separately:

```bash
# Test proxy connectivity
npm run test:proxy

# Test Google account creation workflow
npm run test:google

# Test Kilocode registration workflow
npm run test:kilocode
```

### 3. Integration Test

Test the complete workflow:
```bash
# Basic integration test (no account creation)
node tests/test-integration.js

# Full integration test (creates real accounts - use carefully)
RUN_FULL_INTEGRATION=true node tests/test-integration.js
```

### 4. Health Check

Monitor system health:
```bash
node scripts/health-check.js
```

## First Run

### 1. Dry Run Test

Before creating real accounts, run a dry run:
```bash
# Test workflow without creating accounts
DRY_RUN=true npm start
```

### 2. Single Account Test

Create one test account:
```bash
# Create a single account for testing
npm start -- --count 1 --test-mode
```

### 3. Production Run

Once everything works:
```bash
# Start automation with configured settings
npm start
```

## Verification

### Success Indicators
✅ All tests pass
✅ Health check shows "healthy" status
✅ Proxy connections work
✅ Dolphin Anty API responds
✅ Browser launches successfully

### Common Issues

**Node.js Version Error:**
```bash
# Update Node.js to version 16+
node --version  # Should show v16.0.0 or higher
```

**Dependency Installation Failed:**
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Proxy Connection Failed:**
- Verify proxy credentials
- Check firewall settings
- Test proxy manually with curl

**Dolphin Anty Connection Failed:**
- Ensure Dolphin Anty is running
- Check API token validity
- Verify localhost:3001 is accessible

## Directory Structure

After successful setup:
```
kilocode-automation/
├── src/                    # Main source code
├── config/                 # Configuration files
├── tests/                  # Test scripts
├── scripts/                # Utility scripts
├── logs/                   # Log files
│   ├── registrations/      # Success logs
│   └── batches/           # Batch summaries
├── temp/                  # Temporary files
│   ├── profiles/          # Browser profiles
│   └── screenshots/       # Error screenshots
├── docs/                  # Documentation
├── .env                   # Environment configuration
└── package.json           # Project dependencies
```

## Next Steps

For more detailed information, see:
- [Usage Guide](./USAGE_GUIDE.md) for operation instructions
- [API Reference](./API_REFERENCE.md) for programmatic usage
- [Troubleshooting Guide](./TROUBLESHOOTING.md) for solving problems
- [Deployment Guide](./DEPLOYMENT.md) for production setup

After successful setup:

1. **Read the Usage Guide**: [USAGE_GUIDE.md](USAGE_GUIDE.md)
2. **Review API Reference**: [API_REFERENCE.md](API_REFERENCE.md)
3. **Plan Deployment**: [DEPLOYMENT.md](DEPLOYMENT.md)
4. **Read Testing Guide**: [TESTING.md](../TESTING.md)
5. **Run Regular Health Checks**: `node scripts/health-check.js`

## Support

If you encounter issues:

1. **Check Logs**: Review files in the `logs/` directory
2. **Run Diagnostics**: `node tests/test-environment.js`
3. **Health Check**: `node scripts/health-check.js`
4. **Troubleshooting Guide**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Security Notes

⚠️ **Important Security Considerations:**

- Never commit the `.env` file to version control
- Keep API tokens and passwords secure
- Use strong passwords for proxy accounts
- Regularly rotate API keys
- Monitor logs for suspicious activity
- Run system in isolated environment for production use

---

**Setup Complete!** 🎉

Your Kilocode automation system is now ready for use. Proceed to the Usage Guide for operation instructions.