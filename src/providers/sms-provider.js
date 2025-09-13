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
    await fs.ensureDir(path.dirname(this.filePath)).catch(() => {});
    logger.info(`SMS[Mock] Watching file for code: ${this.filePath}`);

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await fs.pathExists(this.filePath)) {
          const content = await fs.readFile(this.filePath, 'utf8').catch(() => '');
          const code = this._extractCode(content);
          if (code) {
            logger.info('SMS[Mock] Code retrieved from file');
            if (this.clearFileAfterRead) {
              try { await fs.writeFile(this.filePath, ''); } catch (e) {}
            }
            return code;
          }
        }
      } catch (e) {
        logger.warn(`SMS[Mock] File read error: ${e.message}`);
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
    this.sid = process.env.TWILIO_SUBACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || tw.subaccountSid || tw.accountSid || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || tw.authToken || '';
    this.inboundNumber = (process.env.TWILIO_INBOUND_NUMBER || tw.inboundNumber || '').trim();
    this.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || tw.messagingServiceSid || '';
    this.pollIntervalMs = parseInt(process.env.TWILIO_POLL_INTERVAL_MS || tw.pollIntervalMs || 3000, 10);
    this.pollTimeoutMs = parseInt(process.env.TWILIO_POLL_TIMEOUT_MS || tw.pollTimeoutMs || ((settings.google?.phoneVerificationTimeout || 300) * 1000), 10);
    this.windowMinutes = parseInt(process.env.TWILIO_INBOUND_SEARCH_WINDOW_MINUTES || tw.inboundSearchWindowMinutes || 15, 10);

    if (!this.sid || !this.authToken) {
      logger.warn('SMS[Twilio] Missing TWILIO_ACCOUNT_SID/auth token (or subaccount). Set env vars.');
    }
    if (!this.inboundNumber) {
      logger.warn('SMS[Twilio] Missing TWILIO_INBOUND_NUMBER (E.164).');
    }

    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.sid}`;
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      auth: { username: this.sid, password: this.authToken }
    });
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
    if (!this.sid || !this.authToken || !this.inboundNumber) {
      throw new Error('Invalid Twilio configuration (sid/token/number)');
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
      // If the primary call fails, fall back to broad fetch below
      messages = [];
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
  switch (providerName) {
    case 'mock':
      return new MockSmsProvider();
    case 'twilio':
      return new TwilioSmsProvider();
    default:
      logger.warn(`SMS provider "${providerName}" is not implemented. Falling back to "mock".`);
      return new MockSmsProvider();
  }
}

module.exports = getSmsProvider;