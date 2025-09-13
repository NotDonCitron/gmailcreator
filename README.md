# Kilocode Automation System

A comprehensive automation system for creating Google accounts and registering on Kilocode to collect startup bonuses. This system uses advanced stealth techniques, proxy rotation, and browser fingerprint management to avoid detection.

## Features

- **Automated Google Account Creation**: Complete automation of Google signup process including email verification and phone verification
- **Kilocode Registration**: Automated OAuth login and bonus collection from Kilocode platform
- **Stealth Browser Technology**: Advanced anti-detection measures using puppeteer-extra-plugin-stealth
- **Proxy Rotation**: Integrated iProxy support for IP rotation and anonymity
- **Dolphin Anty Integration**: Browser fingerprint management and profile isolation
- **Captcha Solving**: Integrated 2captcha service for automated captcha solving
- **Comprehensive Logging**: Detailed logging with rotation and multiple output formats
- **Error Recovery**: Robust error handling with retry mechanisms and recovery strategies

## Requirements

### System Requirements
- Node.js 16.0.0 or higher
- Windows/Linux/macOS support
- At least 4GB RAM (8GB recommended for multiple instances)
- Stable internet connection

### External Services
- **Dolphin Anty**: Free browser fingerprint management (https://dolphin-anty.com)
- **iProxy**: Rotating proxy service for IP anonymity
- **2captcha**: Captcha solving service (optional but recommended)

## Documentation

- [Setup Guide](docs/SETUP_GUIDE.md)
- [Usage Guide](docs/USAGE_GUIDE.md)
- [API Reference](docs/API_REFERENCE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Testing Guide](TESTING.md)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kilocode-automation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Install Dolphin Anty**
   - Download and install Dolphin Anty from https://dolphin-anty.com
   - Start the local API server (usually runs on localhost:3001)
   - Get your API token from the Dolphin Anty settings

## Configuration

### Environment Variables

Edit the `.env` file with your specific configuration:

```env
# Dolphin Anty API Configuration
DOLPHIN_ANTY_HOST=http://localhost:3001
DOLPHIN_ANTY_TOKEN=your_dolphin_anty_token_here

# Proxy Configuration
PROXY_HOST=your_proxy_host
PROXY_PORT=your_proxy_port
PROXY_USERNAME=your_proxy_username
PROXY_PASSWORD=your_proxy_password

# Captcha Service
TWOCAPTCHA_API_KEY=your_2captcha_api_key_here

# Browser Settings
BROWSER_HEADLESS=true
MAX_RETRIES=3
CONCURRENT_INSTANCES=1
```

### Proxy Setup

Configure your proxy credentials in the `.env` file:
- Host: Your proxy provider's host
- Port: Your proxy provider's port
- Username: Your proxy username
- Password: Your proxy password

You can modify these in the `.env` file or `config/proxies.js`.

### Dolphin Anty Setup

1. Install Dolphin Anty application
2. Start the local API server
3. Create a few test profiles manually to verify functionality
4. Copy your API token to the `.env` file

## Usage

### Basic Usage

```bash
# Run a single registration attempt
npm start

# Run in test mode (no actual registration)
npm run test

# Run with debug output
DEBUG_MODE=true npm start
```

### SMS Provider: Twilio (Polling) and Mock (Default)

This project supports a pluggable SMS provider for phone verification.

- Default: Mock provider for free/manual testing. No Twilio required; supports env/file/prompt code ingestion.
- Twilio: Polls Twilio’s Messages API for inbound SMS to your configured number. No webhooks required.

1) To use Twilio, add to your .env (copy from .env.example and fill real values):
```
# SMS / Phone Verification (Twilio)
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_INBOUND_NUMBER=+1XXXXXXXXXX
# OPTIONAL:
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_POLL_INTERVAL_MS=3000
TWILIO_POLL_TIMEOUT_MS=300000
TWILIO_INBOUND_SEARCH_WINDOW_MINUTES=15
TWILIO_SUBACCOUNT_SID=ACyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
TWILIO_WEBHOOK_URL=https://your-server.example.com/twilio/inbound-sms
```

2) Where to get these:
- Account SID & Auth Token: Twilio Console → Account → General
- Inbound Number (SMS-capable): Twilio Console → Phone Numbers → Manage → Active numbers (buy if needed)
- Messaging Service SID (optional): Twilio Console → Messaging → Services
- Subaccount SID (optional): Twilio Console → Account → Subaccounts

3) How it works:
- The provider polls Twilio’s Messages API for inbound SMS to TWILIO_INBOUND_NUMBER and extracts a 4–8 digit code.
- Defaults: poll every 3s, overall timeout 5 minutes (configurable via env).
- Trial constraints: Inbound testing can be blocked on trial plans and for numbers not owned by the same Twilio project/subaccount. Use the Mock provider until you have either a subaccount SID+token that owns your number or a fully-capable number on the main project.

4) Provider switching:
- Set `SMS_PROVIDER=mock` to use Mock (env/file/prompt).
- Set `SMS_PROVIDER=twilio` to use Twilio polling.

Note: Google sends the verification code to your configured phone number. The provider’s `waitForCode()` reads it; a `sendSms()` helper is available for diagnostics or future flows.

```bash
# Test individual components
npm run test:google    # Test Google account creation
npm run test:kilocode  # Test Kilocode registration
npm run test:proxy     # Test proxy connectivity

# Run with specific settings
CONCURRENT_INSTANCES=3 BROWSER_HEADLESS=false npm start
```

### Command Line Options

The main script supports various command line options:

```bash
node src/main.js --help
node src/main.js --mode test
node src/main.js --batch 10
node src/main.js --headless false
node src/main.js --debug
```

## Project Structure

```
kilocode-automation/
├── src/
│   ├── main.js                 # Main entry point
│   ├── dolphin-anty.js         # Dolphin Anty API integration
│   ├── google-account.js       # Google account creation
│   ├── kilocode-registration.js # Kilocode registration logic
│   ├── stealth-browser.js      # Browser stealth configuration
│   └── data-generator.js       # Random data generation
├── config/
│   ├── proxies.js              # Proxy configuration and rotation
│   └── settings.js             # General application settings
├── utils/
│   ├── logger.js               # Logging utility
│   ├── captcha-solver.js       # Captcha solving integration
│   └── error-handler.js        # Error handling and recovery
├── tests/
│   ├── test-google.js          # Google account testing
│   ├── test-kilocode.js        # Kilocode registration testing
│   └── test-proxy.js           # Proxy functionality testing
├── logs/                       # Application logs
└── temp/                       # Temporary files and profiles
```

## Workflow

The automation system follows this workflow:

1. **Profile Creation**: Creates a new Dolphin Anty browser profile with randomized fingerprint
2. **Proxy Assignment**: Assigns a rotating proxy to the profile for IP anonymity
3. **Data Generation**: Generates realistic user data for account creation
4. **Google Account Creation**: Automates the complete Google signup process
5. **Kilocode Registration**: Uses OAuth to register on Kilocode with the new Google account
6. **Bonus Collection**: Automatically collects available startup bonuses
7. **Data Extraction**: Extracts API keys and account information
8. **Cleanup**: Cleans up browser profiles and logs results

## Stealth Features

The system implements multiple anti-detection measures:

- **Browser Fingerprinting**: Randomized browser fingerprints via Dolphin Anty
- **User Agent Rotation**: Dynamic user agent strings
- **Viewport Randomization**: Random window sizes and screen resolutions
- **WebRTC Protection**: Prevents IP leaks through WebRTC
- **Canvas Fingerprinting**: Spoofs canvas fingerprinting attempts
- **Timing Randomization**: Human-like delays and interaction patterns
- **Plugin Simulation**: Simulates common browser plugins and extensions

## Monitoring and Logging

### Log Files

- `logs/registrations.log`: Successful registrations with account details
- `logs/errors.log`: Error logs and failed attempts
- `logs/debug.log`: Detailed debug information
- `logs/app.log`: General application logs

### Monitoring

The system provides real-time monitoring of:
- Registration success/failure rates
- Proxy health and rotation status
- Captcha solving statistics
- Error patterns and recovery attempts

## Troubleshooting

### Common Issues

1. **Dolphin Anty Connection Failed**
   - Ensure Dolphin Anty is running and API server is started
   - Check the API token in `.env` file
   - Verify firewall settings allow localhost connections

2. **Proxy Connection Issues**
   - Test proxy connectivity with `npm run test:proxy`
   - Check proxy credentials in `.env` file
   - Verify proxy service is active

3. **Captcha Solving Failures**
   - Check 2captcha API key and balance
   - Increase captcha timeout in settings
   - Consider alternative captcha services

4. **Google Account Creation Blocked**
   - Increase delays between registration attempts
   - Use fresh proxy IPs
   - Verify user data generation quality

5. **Browser Launch Failures**
   - Check system resources (RAM, CPU)
   - Reduce concurrent instances
   - Clear browser cache and temporary files

### Debug Mode

Enable debug mode for detailed troubleshooting:

```bash
DEBUG_MODE=true SCREENSHOT_ON_ERROR=true npm start
```

This will:
- Save screenshots on errors
- Log detailed browser interactions
- Preserve HTML content for analysis
- Show verbose console output

## Security Considerations

- **Environment Variables**: Never commit `.env` files with real credentials
- **Proxy Security**: Use reputable proxy services with proper authentication
- **Data Handling**: Implement secure storage for generated account data
- **Rate Limiting**: Respect platform rate limits to avoid detection
- **Legal Compliance**: Ensure automation complies with platform terms of service

## Performance Optimization

### Single Instance Optimization
- Reduce browser memory usage with `--no-sandbox` flag
- Implement efficient DOM querying strategies
- Optimize image and resource loading

### Multi-Instance Scaling
- Use process clustering for parallel execution
- Implement queue-based job distribution
- Monitor system resources and auto-scale

### Resource Management
- Automatic cleanup of browser profiles
- Log file rotation and archival
- Memory leak prevention strategies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with proper testing
4. Update documentation
5. Submit a pull request

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Disclaimer

This software is for educational and research purposes only. Users are responsible for ensuring compliance with all applicable terms of service and local laws. The authors are not responsible for any misuse of this software.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review log files for error details
3. Test individual components with provided test scripts
4. Open an issue with detailed error information

## Version History

- **v1.0.0**: Initial release with core automation features
- Features planned for future releases:
  - Multi-platform captcha service support
  - Advanced fingerprinting techniques
  - Database integration for account management
  - Web dashboard for monitoring and control