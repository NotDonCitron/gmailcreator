#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const url = require('url');

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
          resolve({ status, json });
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

(async () => {
  try {
    const accountSid = getEnv('TWILIO_ACCOUNT_SID');
    const authToken = getEnv('TWILIO_AUTH_TOKEN');
    const subaccountSid = getEnv('TWILIO_SUBACCOUNT_SID');
    const inboundNumber = getEnv('TWILIO_INBOUND_NUMBER');

    const effectiveSid = (process.argv.includes('--use-main') || process.env.TWILIO_FORCE_MAIN === '1')
      ? accountSid
      : (subaccountSid || accountSid);

    console.log('Twilio env summary:');
    console.log('  TWILIO_ACCOUNT_SID:', mask(accountSid));
    console.log('  TWILIO_SUBACCOUNT_SID:', subaccountSid ? mask(subaccountSid) : '(not set)');
    console.log('  Using SID:', mask(effectiveSid));
    console.log('  TWILIO_AUTH_TOKEN:', authToken ? mask(authToken) : '(not set)');
    console.log('  TWILIO_INBOUND_NUMBER:', inboundNumber || '(not set)');

    if (!effectiveSid || !authToken) {
      console.error('Config error: SID and AUTH TOKEN are required.');
      process.exit(2);
    }

    // 1) Validate credentials by fetching account resource
    const accountUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(effectiveSid)}.json`;
    const a = await httpGetJson(accountUrl, effectiveSid, authToken);
    if (a.status === 200) {
      const friendlyName = a.json?.friendly_name || a.json?.friendlyName;
      const status = a.json?.status;
      console.log('✅ Credentials OK for SID:', mask(effectiveSid), `(name="${friendlyName || 'unknown'}", status=${status || 'unknown'})`);
    } else if (a.status === 401) {
      console.error('❌ 401 Unauthorized: Invalid SID/AUTH_TOKEN combination or wrong account/subaccount.');
      process.exit(3);
    } else {
      console.error(`❌ Unexpected status ${a.status} from account check:`, a.json || a.text);
      // continue to number check anyway
    }

    // 2) Either list numbers (if --list-numbers) or check configured inbound number
    if (process.argv.includes('--list-numbers')) {
      const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(effectiveSid)}/IncomingPhoneNumbers.json?PageSize=1000`;
      const ln = await httpGetJson(listUrl, effectiveSid, authToken);
      if (ln.status === 200) {
        const items = ln.json?.incoming_phone_numbers || ln.json?.incomingPhoneNumbers || [];
        if (!Array.isArray(items) || items.length === 0) {
          console.log('No active incoming phone numbers found for this account.');
        } else {
          console.log('Active incoming phone numbers:');
          for (const rec of items) {
            const num = rec?.phone_number || rec?.phoneNumber || '(unknown)';
            const name = rec?.friendly_name || rec?.friendlyName || '';
            const smsCap = !!(rec?.capabilities?.sms);
            console.log(` - ${num}  name="${name}"  smsCapable=${smsCap}`);
          }
        }
      } else if (ln.status === 401) {
        console.error('❌ 401 Unauthorized when listing numbers. Credentials issue or wrong account/subaccount.');
        process.exit(5);
      } else {
        console.error(`❌ Unexpected status ${ln.status} when listing phone numbers:`, ln.json || ln.text);
      }
    } else if (inboundNumber) {
      const numUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(effectiveSid)}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(inboundNumber)}`;
      const n = await httpGetJson(numUrl, effectiveSid, authToken);
      if (n.status === 200) {
        const items = n.json?.incoming_phone_numbers || n.json?.incomingPhoneNumbers || [];
        if (Array.isArray(items) && items.length > 0) {
          const rec = items[0];
          const smsCapable = !!(rec?.capabilities?.sms);
          console.log(`✅ Inbound number found and linked to this account: ${inboundNumber} (smsCapable=${smsCapable})`);
        } else {
          console.error(`❌ Inbound number ${inboundNumber} not found under this account/SID. Make sure the number exists in this project (and subaccount if used).`);
          process.exit(4);
        }
      } else if (n.status === 401) {
        console.error('❌ 401 Unauthorized when listing numbers. Credentials issue or wrong account/subaccount.');
        process.exit(5);
      } else {
        console.error(`❌ Unexpected status ${n.status} when checking phone number:`, n.json || n.text);
        // do not exit hard
      }
    } else {
      console.warn('⚠️ TWILIO_INBOUND_NUMBER is not set; polling provider will not work until it is.');
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('💥 Error:', err.message);
    process.exit(1);
  }
})();