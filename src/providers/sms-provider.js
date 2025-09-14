/**
 * Pluggable SMS provider selector with a default Mock provider that supports free/manual testing.
 * Modes:
 *  - env:    read code from SMS_CODE environment variable (one-shot, polled until timeout)
 *  - file:   poll a file path for a numeric code; optional clear after read
 *  - prompt: ask on stdin once and wait for user input (with timeout)
 */
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');
const settings = require('../../config/settings');
const logger = require('../../utils/logger');
const axios = require('axios');
const OnlineSimSmsProvider = require('./onlinesim-provider');

const CODE_REGEX = /\b(\d{4,8})\b/;

class MockSmsProvider {
  constructor(opts = {}) {
    const cfg = settings.sms || {};
    const inputCfg = (settings.sms && settings.sms.codeInput) || {};

    this.mode = (process.env.SMS_CODE_INPUT_MODE || inputCfg.mode || 'env').toLowerCase(); // env | file | prompt
    this.filePath = process.env.SMS_CODE_FILE || inputCfg.filePath || './temp/sms_code.txt';
    this.pollIntervalMs = parseInt(process.env.SMS_CODE_POLL_INTERVAL_MS || inputCfg.pollIntervalMs || 2000, 10);
    this.clearFileAfterRead = (process.env.SMS_CODE_CLEAR_FILE || String(inputCfg.clearFileAfterRead) || 'false') === 'true';

    // Normalize absolute path for file mode
    if (this.mode === 'file') {
      this.filePath = path.isAbsolute(this.filePath) ? this.filePath : path.join(process.cwd(), this.filePath);
    }
  }

  async waitForCode({ timeoutMs = 300000 } = {}) {
    logger.info(`SMS[Mock] Waiting for code using mode=${this.mode} timeout=${Math.round(timeoutMs / 1000)}s`);

    switch (this.mode) {
      case 'env':
        return await this._fromEnv(timeoutMs);
      case 'file':
        return await this._fromFile(timeoutMs);
      case 'prompt':
        return await this._fromPrompt(timeoutMs);
      default:
        logger.warn(`SMS[Mock] Unknown mode "${this.mode}", falling back to "env"`);
        return await this._fromEnv(timeoutMs);
    }
  }

  async _fromEnv(timeoutMs) {
    // Poll ENV to allow external setting while running
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const raw = process.env.SMS_CODE || '';
      const code = this._extractCode(raw);
      if (code) {
        logger.info('SMS[Mock] Code retrieved from ENV');
        return code;
      }
      await this._sleep(1000);
    }
    logger.warn('SMS[Mock] ENV mode timed out without code');
    return null;
  }

  async _fromFile(timeoutMs) {
    try {
      await fs.ensureDir(path.dirname(this.filePath));
    } catch (dirError) {
      logger.warn(`SMS[Mock] Failed to create directory: ${dirError.message}`);
    }

    logger.info(`SMS[Mock] Watching file for code: ${this.filePath}`);

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await fs.pathExists(this.filePath)) {
          const content = await fs.readFile(this.filePath, 'utf8').catch((readError) => {
            logger.warn(`SMS[Mock] File read error: ${readError.message}`);
            return '';
          });
          const code = this._extractCode(content);
          if (code) {
            logger.info('SMS[Mock] Code retrieved from file');
            if (this.clearFileAfterRead) {
              try {
                await fs.writeFile(this.filePath, '');
                logger.debug('SMS[Mock] File cleared after reading code');
              } catch (clearError) {
                logger.warn(`SMS[Mock] Failed to clear file: ${clearError.message}`);
              }
            }
            return code;
          }
        }
      } catch (e) {
        logger.warn(`SMS[Mock] File system error: ${e.message}`);
        // Continue trying in case it's a temporary file system issue
      }
      await this._sleep(this.pollIntervalMs);
    }

    logger.warn('SMS[Mock] File mode timed out without code');
    return null;
  }

  async _fromPrompt(timeoutMs) {
    logger.info('SMS[Mock] Waiting for manual code entry on stdin (prompt mode)');
    return await this._readlineOnceWithTimeout('Enter SMS code: ', timeoutMs);
  }

  _extractCode(text) {
    if (!text) return null;

    // Enhanced regex to handle various SMS code formats
    const enhancedCodeRegex = /(?:code|verification|otp|pin)[:\s]*([0-9]{4,8})|\b([0-9]{6})\b|\b([0-9]{4})\b|\b([0-9]{5})\b|\b([0-9]{7})\b|\b([0-9]{8})\b/gi;

    const matches = [...String(text).matchAll(enhancedCodeRegex)];

    for (const match of matches) {
      // Find the first non-undefined capture group
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          return match[i];
        }
      }
    }

    // Fallback to original regex
    const m = String(text).match(CODE_REGEX);
    return m ? m[1] : null;
  }

  async _readlineOnceWithTimeout(question, timeoutMs) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { rl.close(); } catch (_e) {}
          logger.warn('SMS[Mock] Prompt timed out');
          resolve(null);
        }
      }, timeoutMs);

      rl.question(question, (answer) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        const code = this._extractCode(answer);
        try { rl.close(); } catch (_e) {}
        if (code) {
          logger.info('SMS[Mock] Code received from prompt');
        } else {
          logger.warn('SMS[Mock] No numeric code detected in prompt input');
        }
        resolve(code || null);
      });
    });
  }

  async _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

/**
 * Twilio SMS provider (polling-based)
 * - Reads inbound messages for the configured Twilio number and extracts a 4-8 digit code
 * - Does not require webhook; uses REST polling
 */
class TwilioSmsProvider {
  constructor() {
    const tw = (settings.sms && settings.sms.twilio) || {};
    // Prefer explicit env to allow live overrides
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || tw.accountSid || '';
    this.subaccountSid = process.env.TWILIO_SUBACCOUNT_SID || tw.subaccountSid || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || tw.authToken || '';
    this.inboundNumber = (process.env.TWILIO_INBOUND_NUMBER || tw.inboundNumber || '').trim();
    this.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || tw.messagingServiceSid || '';
    this.pollIntervalMs = parseInt(process.env.TWILIO_POLL_INTERVAL_MS || tw.pollIntervalMs || 3000, 10);
    this.pollTimeoutMs = parseInt(process.env.TWILIO_POLL_TIMEOUT_MS || tw.pollTimeoutMs || ((settings.google?.phoneVerificationTimeout || 300) * 1000), 10);
    this.windowMinutes = parseInt(process.env.TWILIO_INBOUND_SEARCH_WINDOW_MINUTES || tw.inboundSearchWindowMinutes || 15, 10);

    // Use subaccount SID for API calls if provided, otherwise main account SID
    this.sid = this.subaccountSid || this.accountSid;

    // Validate credentials
    this.validateCredentials();

    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.sid}`;
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      auth: { username: this.sid, password: this.authToken }
    });

    // Validate configuration on initialization
    this.initializationPromise = this.validateConfiguration();
  }

  validateCredentials() {
    const issues = [];

    if (!this.accountSid) {
      issues.push('Missing TWILIO_ACCOUNT_SID');
    } else if (!this.accountSid.startsWith('AC') || this.accountSid.length !== 34) {
      issues.push('Invalid TWILIO_ACCOUNT_SID format (should start with AC and be 34 characters)');
    }

    if (this.subaccountSid && (!this.subaccountSid.startsWith('AC') || this.subaccountSid.length !== 34)) {
      issues.push('Invalid TWILIO_SUBACCOUNT_SID format (should start with AC and be 34 characters)');
    }

    if (!this.authToken) {
      issues.push('Missing TWILIO_AUTH_TOKEN');
    } else if (this.authToken.length !== 32) {
      issues.push('Invalid TWILIO_AUTH_TOKEN format (should be 32 characters)');
    }

    if (!this.inboundNumber) {
      issues.push('Missing TWILIO_INBOUND_NUMBER (E.164 format)');
    } else if (!this.inboundNumber.match(/^\+[1-9]\d{1,14}$/)) {
      issues.push('Invalid TWILIO_INBOUND_NUMBER format (should be E.164 format like +1234567890)');
    }

    if (issues.length > 0) {
      logger.error('SMS[Twilio] Configuration validation failed:', issues.join(', '));
      this.credentialsValid = false;
    } else {
      this.credentialsValid = true;
      logger.debug('SMS[Twilio] Credentials validation passed');
    }
  }

  async validateConfiguration() {
    if (!this.credentialsValid) {
      logger.warn('SMS[Twilio] Skipping API validation due to credential format issues');
      return false;
    }

    try {
      logger.debug('SMS[Twilio] Validating API connectivity...');

      // Test API connectivity with a simple account fetch
      const response = await this.http.get('.json');

      if (response.data && response.data.sid) {
        logger.info('SMS[Twilio] API validation successful');
        return true;
      } else {
        throw new Error('Unexpected API response format');
      }
    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      if (status === 401) {
        logger.error('SMS[Twilio] Authentication failed - invalid credentials');
        if (errorData?.message) {
          logger.error('SMS[Twilio] API Error:', errorData.message);
        }
      } else if (status === 403) {
        logger.error('SMS[Twilio] Forbidden - check account permissions');
      } else {
        logger.error('SMS[Twilio] API validation failed:', error.message);
      }

      return false;
    }
  }

  async sendSms({ to, body }) {
    if (!this.sid || !this.authToken) {
      throw new Error('SMS[Twilio] Cannot send SMS: missing TWILIO_ACCOUNT_SID/AUTH_TOKEN');
    }
    if (!to || !body) {
      throw new Error('SMS[Twilio] sendSms requires both "to" and "body"');
    }

    // Choose Messaging Service or direct From number
    const useMessagingService = !!this.messagingServiceSid;
    const fromNumber = this.inboundNumber; // reuse inbound number for from (must be SMS-capable)

    if (!useMessagingService && !fromNumber) {
      throw new Error('SMS[Twilio] No Messaging Service SID and no From number configured');
    }

    const form = new URLSearchParams();
    form.append('To', to);
    form.append('Body', String(body));
    if (useMessagingService) {
      form.append('MessagingServiceSid', this.messagingServiceSid);
    } else {
      form.append('From', fromNumber);
    }

    try {
      const resp = await this.http.post('/Messages.json', form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const sid = resp.data && (resp.data.sid || resp.data.Sid);
      logger.info(`SMS[Twilio] Sent SMS to ${to}${useMessagingService ? ' via Messaging Service' : ` from ${fromNumber}`}${sid ? ` (sid=${sid})` : ''}`);
      return sid || true;
    } catch (e) {
      const status = e.response?.status;
      const text = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      logger.error('SMS[Twilio] Send SMS failed:', { status, error: text });
      throw new Error(`SMS[Twilio] Send failed: ${status || ''} ${text}`);
    }
  }

  async sendVerificationCode(to, codeText = 'Your verification code') {
    // Thin wrapper to align with a verification interface
    return this.sendSms({ to, body: String(codeText) });
  }

  async waitForCode({ timeoutMs } = {}) {
    const effectiveTimeout = typeof timeoutMs === 'number' ? timeoutMs : this.pollTimeoutMs;
    const start = Date.now();
    logger.info(`SMS[Twilio] Polling for inbound code to ${this.inboundNumber} (timeout=${Math.round(effectiveTimeout/1000)}s, interval=${this.pollIntervalMs}ms)`);

    while (Date.now() - start < effectiveTimeout) {
      try {
        const code = await this._checkInboxOnce();
        if (code) {
          logger.info('SMS[Twilio] Code found in inbox');
          return code;
        }
      } catch (e) {
        logger.warn(`SMS[Twilio] Poll error: ${e.message}`);
      }
      await this._sleep(this.pollIntervalMs);
    }

    logger.warn('SMS[Twilio] Timed out waiting for code');
    return null;
  }

  async _checkInboxOnce() {
    // Ensure initialization completed
    const isValid = await this.initializationPromise;
    if (!isValid) {
      throw new Error('Twilio configuration validation failed - check credentials and API access');
    }

    if (!this.credentialsValid) {
      throw new Error('Invalid Twilio credentials format');
    }

    const now = Date.now();
    const cutoff = now - (this.windowMinutes * 60 * 1000);

    // Primary query: filter by To on server-side
    const primaryUrl = `/Messages.json?To=${encodeURIComponent(this.inboundNumber)}&PageSize=50`;
    let messages = [];
    try {
      const resp = await this.http.get(primaryUrl);
      messages = (resp.data && (resp.data.messages || resp.data.Messages || resp.data.data)) || [];
    } catch (e) {
      const status = e.response?.status;

      if (status === 401) {
        throw new Error('Twilio authentication failed - check your account SID and auth token');
      } else if (status === 404) {
        throw new Error('Twilio API endpoint not found - check your account SID format');
      } else if (status === 429) {
        throw new Error('Twilio rate limit exceeded - please wait before retrying');
      } else {
        logger.warn(`SMS[Twilio] Primary query failed (${status}): ${e.message}, trying fallback`);
        // If the primary call fails, fall back to broad fetch below
        messages = [];
      }
    }

    // If primary returns nothing, fallback: fetch recent messages without filter and filter client-side
    if (!Array.isArray(messages) || messages.length === 0) {
      try {
        const fallbackUrl = `/Messages.json?PageSize=50`;
        const resp2 = await this.http.get(fallbackUrl);
        const all = (resp2.data && (resp2.data.messages || resp2.data.Messages || resp2.data.data)) || [];
        messages = Array.isArray(all) ? all : [];
      } catch (_e) {
        // ignore; will return null below
      }
    }

    for (const m of messages) {
      // Fields of interest: direction, to, body, date_created/date_sent
      const to = (m.to || m.To || '').trim();
      const direction = (m.direction || m.Direction || '').toLowerCase();
      const body = (m.body || m.Body || '');
      const ts = Date.parse(m.date_sent || m.date_created || m.dateUpdated || m.DateSent || m.DateCreated || '');

      if (to === this.inboundNumber && direction.includes('inbound')) {
        if (!Number.isNaN(ts) && ts < cutoff) {
          // Too old
          continue;
        }
        const code = this._extractCode(body);
        if (code) return code;
      }
    }

    return null;
  }

  _extractCode(text) {
    if (!text) return null;
    const m = String(text).match(CODE_REGEX);
    return m ? m[1] : null;
  }

  async _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

/**
 * Provider selector - currently supports 'mock' for free/manual flows.
 * Future: add 5sim, sms-activate, smspool, etc.
 */
function getSmsProvider() {
  const providerName = (process.env.SMS_PROVIDER || (settings.sms && settings.sms.provider) || 'mock').toLowerCase();
  const fallbackChain = process.env.SMS_PROVIDER_FALLBACK_CHAIN?.split(',').map(p => p.trim().toLowerCase()) || ['mock'];

  // Validate credentials on startup if configured
  const validateOnStartup = (process.env.SMS_CREDENTIAL_VALIDATION_ON_STARTUP || 'true') === 'true';

  const createProvider = (name) => {
    switch (name) {
      case 'mock':
        return new MockSmsProvider();
      case 'onlinesim':
        return new OnlineSimSmsProvider();
      case 'twilio':
        const twilioProvider = new TwilioSmsProvider();
        if (validateOnStartup && !twilioProvider.credentialsValid) {
          logger.warn('SMS[Twilio] Credentials validation failed, falling back to mock provider');
          return null; // Will trigger fallback
        }
        return twilioProvider;
      default:
        logger.warn(`SMS provider "${name}" is not implemented.`);
        return null;
    }
  };

  // Try primary provider first
  const primaryProvider = createProvider(providerName);
  if (primaryProvider) {
    logger.info(`SMS provider initialized: ${providerName}`);
    return primaryProvider;
  }

  // Try fallback chain
  logger.warn(`Primary SMS provider "${providerName}" failed, trying fallback chain: ${fallbackChain.join(', ')}`);
  for (const fallbackName of fallbackChain) {
    if (fallbackName === providerName) continue; // Already tried

    const fallbackProvider = createProvider(fallbackName);
    if (fallbackProvider) {
      logger.info(`SMS provider fallback successful: ${fallbackName}`);
      return fallbackProvider;
    }
  }

  // Final fallback to mock
  logger.warn('All SMS providers failed, using mock provider as final fallback');
  return new MockSmsProvider();
}

module.exports = getSmsProvider;