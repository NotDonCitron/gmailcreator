/**
 * OnlineSim.io SMS provider integration
 * Replaces Twilio/Mock for automated SMS verification
 * API Docs: https://onlinesim.io/api/
 */
const axios = require('axios');
const settings = require('../../config/settings');
const logger = require('../../utils/logger');

const CODE_REGEX = /\b(\d{4,8})\b/;

class OnlineSimSmsProvider {
  constructor() {
    const cfg = settings.sms?.onlinesim || {};
    this.apiKey = process.env.ONLINESIM_API_KEY || cfg.apiKey || '';
    this.baseUrl = 'https://onlinesim.io/api';
    this.pollIntervalMs = parseInt(process.env.ONLINESIM_POLL_INTERVAL_MS || cfg.pollIntervalMs || '3000', 10);
    this.pollTimeoutMs = parseInt(process.env.ONLINESIM_POLL_TIMEOUT_MS || cfg.pollTimeoutMs || '300000', 10);
    this.country = process.env.ONLINESIM_COUNTRY || cfg.country || '91'; // India default
    
    if (!this.apiKey) {
      logger.warn('SMS[OnlineSim] Missing ONLINESIM_API_KEY. Set env var or config.');
    }
  }

  async waitForCode({ timeoutMs } = {}) {
    const effectiveTimeout = typeof timeoutMs === 'number' ? timeoutMs : this.pollTimeoutMs;
    logger.info(`SMS[OnlineSim] Starting verification flow (country=${this.country}, timeout=${Math.round(effectiveTimeout/1000)}s)`);

    try {
      // Step 1: Buy number for Google service
      const sessionId = await this._buyNumber();
      if (!sessionId) {
        logger.error('SMS[OnlineSim] Failed to buy number');
        return null;
      }

      // Step 2: Poll for SMS code
      const code = await this._pollForCode(sessionId, effectiveTimeout);
      return code;

    } catch (error) {
      logger.error('SMS[OnlineSim] Verification flow failed:', error.message);
      return null;
    }
  }

  async _buyNumber() {
    if (!this.apiKey) {
      throw new Error('OnlineSim API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/getNum.php`, {
        params: {
          apikey: this.apiKey,
          service: 'google',
          country: this.country
        },
        timeout: 20000
      });

      if (response.data?.response === '1' && response.data?.tzid) {
        const tzid = response.data.tzid;
        logger.info(`SMS[OnlineSim] Number purchased successfully (tzid=${tzid})`);
        return tzid;
      } else {
        logger.error('SMS[OnlineSim] Buy number failed:', response.data);
        return null;
      }
    } catch (error) {
      logger.error('SMS[OnlineSim] Buy number error:', error.message);
      return null;
    }
  }

  async _pollForCode(tzid, timeoutMs) {
    const start = Date.now();
    let attempts = 0;
    
    logger.info(`SMS[OnlineSim] Polling for code (tzid=${tzid}, interval=${this.pollIntervalMs}ms)`);

    while (Date.now() - start < timeoutMs) {
      try {
        attempts++;
        const response = await axios.get(`${this.baseUrl}/getSms.php`, {
          params: {
            apikey: this.apiKey,
            tzid: tzid
          },
          timeout: 20000
        });

        // Check if SMS received
        if (response.data?.response === '1' && response.data?.msg) {
          const smsText = response.data.msg;
          const code = this._extractCode(smsText);
          
          if (code) {
            logger.info(`SMS[OnlineSim] Code received: ${code}`);
            return code;
          } else {
            logger.warn(`SMS[OnlineSim] SMS received but no code found: ${smsText}`);
          }
        } else if (response.data?.response === '2') {
          // SMS not yet received, continue polling
          logger.debug(`SMS[OnlineSim] No SMS yet (attempt ${attempts})`);
        } else {
          logger.warn(`SMS[OnlineSim] Unexpected response:`, response.data);
        }

      } catch (error) {
        logger.warn(`SMS[OnlineSim] Poll error (attempt ${attempts}):`, error.message);
      }

      await this._sleep(this.pollIntervalMs);
    }

    logger.warn('SMS[OnlineSim] Timeout waiting for code');
    return null;
  }

  _extractCode(text) {
    if (!text) return null;
    const m = String(text).match(CODE_REGEX);
    return m ? m[1] : null;
  }

  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = OnlineSimSmsProvider;