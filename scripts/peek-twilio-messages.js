#!/usr/bin/env node

/**
 * Quick inspector for recent inbound Twilio messages to your configured number.
 * Reads:
 *  - TWILIO_ACCOUNT_SID or TWILIO_SUBACCOUNT_SID
 *  - TWILIO_AUTH_TOKEN
 *  - TWILIO_INBOUND_NUMBER
 *
 * Usage:
 *   node scripts/peek-twilio-messages.js            # default PageSize=10
 *   node scripts/peek-twilio-messages.js 20         # custom page size (max 50)
 *
 * Helpful to run alongside [scripts/test-twilio.js](scripts/test-twilio.js:1).
 */

require('dotenv').config();
const https = require('https');
const url = require('url');

const CODE_REGEX = /\b(\d{4,8})\b/;

function mask(str, keepStart = 4, keepEnd = 4) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= keepStart + keepEnd) return '*'.repeat(s.length);
  return s.slice(0, keepStart) + '*'.repeat(s.length - keepStart - keepEnd) + s.slice(-keepEnd);
}

function getEnv(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

function httpGetJson(targetUrl, username, password) {
  return new Promise((resolve, reject) => {
    const u = new url.URL(targetUrl);
    const opts = {
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      headers: {
        'Accept': 'application/json'
      },
      auth: `${username}:${password}`,
      timeout: 20000
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const status = res.statusCode;
        try {
          const json = JSON.parse(data || '{}');
          resolve({ status, json, raw: data });
        } catch {
          resolve({ status, text: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.end();
  });
}

function extractCode(text) {
  if (!text) return null;
  const m = String(text).match(CODE_REGEX);
  return m ? m[1] : null;
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d || '');
    return dt.toISOString();
  } catch {
    return String(d || '');
  }
}

(async () => {
  try {
    const accountSid = getEnv('TWILIO_ACCOUNT_SID');
    const subaccountSid = getEnv('TWILIO_SUBACCOUNT_SID');
    const authToken = getEnv('TWILIO_AUTH_TOKEN');
    const inboundNumber = getEnv('TWILIO_INBOUND_NUMBER');

    const effectiveSid = subaccountSid || accountSid;
    const pageSize = Math.min(Math.max(parseInt(process.argv[2] || '10', 10) || 10, 1), 50);

    if (!effectiveSid || !authToken) {
      console.error('Missing TWILIO_ACCOUNT_SID/SUBACCOUNT_SID or TWILIO_AUTH_TOKEN');
      process.exit(2);
    }
    if (!inboundNumber) {
      console.error('Missing TWILIO_INBOUND_NUMBER (E.164), e.g., +14155550123');
      process.exit(2);
    }

    console.log('Twilio peek:');
    console.log('  Using SID:', mask(effectiveSid));
    console.log('  Inbound:', inboundNumber);
    console.log('  PageSize:', pageSize);

    const msgUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(effectiveSid)}` +
      `/Messages.json?To=${encodeURIComponent(inboundNumber)}&PageSize=${pageSize}`;

    const resp = await httpGetJson(msgUrl, effectiveSid, authToken);
    if (resp.status === 401) {
      console.error('❌ 401 Unauthorized: SID/token mismatch for this account/subaccount.');
      process.exit(3);
    }
    if (resp.status !== 200) {
      console.error(`❌ Unexpected status ${resp.status}:`, resp.json || resp.text);
      process.exit(4);
    }

    const messages = (resp.json && (resp.json.messages || resp.json.Messages || resp.json.data)) || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      console.log('No messages found for this inbound number.');
      process.exit(0);
    }

    console.log(`Found ${messages.length} messages to ${inboundNumber} (newest first):`);
    let foundCode = null;

    for (const m of messages) {
      const to = (m.to || m.To || '').trim();
      const from = (m.from || m.From || '').trim();
      const body = (m.body || m.Body || '');
      const direction = (m.direction || m.Direction || '').toLowerCase();
      const dateStr = m.date_sent || m.date_created || m.dateUpdated || m.DateSent || m.DateCreated || '';
      const code = extractCode(body);

      console.log('---');
      console.log('To:        ', to);
      console.log('From:      ', from);
      console.log('Direction: ', direction);
      console.log('Date:      ', fmtDate(dateStr));
      console.log('Body:      ', body.replace(/\r?\n/g, ' '));
      if (code) {
        console.log('Code:      ', code);
        if (!foundCode && direction.includes('inbound')) {
          foundCode = code;
        }
      }
    }

    if (foundCode) {
      console.log(`\n✅ Detected code in inbound messages: ${foundCode}`);
      process.exit(0);
    } else {
      console.log('\nℹ️ No 4–8 digit code detected in recent inbound messages.');
      process.exit(0);
    }
  } catch (err) {
    console.error('💥 Error:', err.message);
    process.exit(1);
  }
})();