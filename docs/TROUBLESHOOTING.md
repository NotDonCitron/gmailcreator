# Kilocode Automation System - Troubleshooting Guide

This guide helps diagnose and resolve common issues across proxies, Dolphin Anty, Google signup, OAuth, and captchas. It also lists where to find logs and how to collect diagnostics.

## Table of Contents
- Quick Diagnostics
- Logs and Artifacts
- Common Issues
  - Proxy Connectivity and Exit IP
  - Dolphin Anty Integration
  - Browser Launch and Stability
  - Google Signup Flow
  - Kilocode OAuth and Registration
  - Captcha Solving
  - File System and Permissions
- Recovery and Cleanup
- Advanced Diagnostics
- FAQ

---

## Quick Diagnostics

1) Run environment tests:
   - `npm run test:env`
   - Expected: No missing core environment variables, basic Node and dependency checks pass.

2) Verify proxy connectivity with exit IP:
   - `npm run test:proxy`
   - Expected: Reported IP is non-empty and consistent across system logs and results.

3) Component integration smoke test:
   - `node tests/test-integration.js`
   - For full run: `RUN_FULL_INTEGRATION=true node tests/test-integration.js` (will create real accounts)

4) Health check:
   - `node scripts/health-check.js`

---

## Logs and Artifacts

- Application logs: `./logs/` (daily rotate with gzip)
  - Combined/app logs: `logs/combined-YYYY-MM-DD.log`, `logs/app-YYYY-MM-DD.log`
  - Errors: `logs/error-YYYY-MM-DD.log`
  - Registrations (JSON): `logs/registrations-*` style application event logs and per-registration JSON in `logs/registrations/` if configured
  - Batches (JSON): `logs/batches/` summaries if configured
- Temp artifacts:
  - Profiles: `./temp/profiles/`
  - Screenshots on error (optional): `./temp/screenshots/`
  - HTML on error (optional): `./temp/screenshots/*.html`

Enable more diagnostics via environment:
- `DEBUG_MODE=true`
- `SCREENSHOT_ON_ERROR=true`
- `SAVE_HTML_ON_ERROR=true`
- `BROWSER_HEADLESS=false` (interactive debugging)

---

## Common Issues

### 1) Proxy Connectivity and Exit IP

Symptoms:
- Requests time out when launching or navigating
- Proxy test fails in `tests/test-proxy.js`
- Result JSON shows `proxy.ip: null` or missing

Checks:
- Verify `.env`:
  - `PROXY_HOST`, `PROXY_PORT`, `PROXY_USERNAME`, `PROXY_PASSWORD`, `PROXY_TYPE`
- Run `npm run test:proxy` and confirm:
  - Success with valid `ip`
- In code paths, `ProxyManager.getWorkingProxy()` now sets `ip` after successful verification
- Confirm `src/main.js` result object includes `proxy: { sessionId, ip }`

Fixes:
- Correct credentials and provider network access
- Reduce rate by lowering concurrency and increasing delays
- If auth proxies need proxy-chain, rely on built-in handling in `src/stealth-browser.js`

### 2) Dolphin Anty Integration

Symptoms:
- Failure to create or start Anty profiles
- No WebSocket endpoint from Anty
- Hard requirement error for `DOLPHIN_ANTY_HOST`

Checks:
- Anty is optional. System falls back to regular stealth browser when Anty is not configured or fails
- Ensure Anty app is running and API is reachable if used
- Env:
  - Optional unless `--use-dolphin` or `DOLPHIN_ANTY_TOKEN` is set
  - When required: `DOLPHIN_ANTY_HOST`, `DOLPHIN_ANTY_TOKEN`

Fixes:
- Remove `--use-dolphin` if not needed
- Start Anty and verify: `curl -H "Authorization: Bearer $DOLPHIN_ANTY_TOKEN" $DOLPHIN_ANTY_HOST/v1.0/browser_profiles`
- Let automation fallback to regular launch

### 3) Browser Launch and Stability

Symptoms:
- Browser fails to start or connect
- Immediate crashes or closed sessions

Checks:
- Set `BROWSER_HEADLESS=false` to observe
- Check logs for launch options and proxy args
- Verify that `puppeteer` is compatible with OS and Node version

Fixes:
- Reduce `CONCURRENT_INSTANCES`
- Increase timeouts: `BROWSER_TIMEOUT`
- Clear temp profiles: `rm -rf temp/profiles/*` (or use cleanup script)

### 4) Google Signup Flow

Symptoms:
- Form interactions blocked
- Unexpected layout/captcha/phone-verification issues

Checks:
- Proxy exit IP quality and geolocation consistency
- Human-like timing is applied (stealth helpers and delays)
- Captcha service availability

Fixes:
- Increase randomized delays in `.env`
- Switch to better proxies
- Run visible browser for manual inspection of selectors and steps

### 5) Kilocode OAuth and Registration

Symptoms:
- OAuth redirects fail or hang
- Registration data incomplete in results

Checks:
- Verify that Google account is created (when not skipped)
- Review `kilocode-registration` logs and navigation waits
- Ensure bonus collection waits long enough

Fixes:
- Increase `KILOCODE_REGISTRATION_DELAY` and timeouts
- Add debug screenshots/HTML
- Validate selectors for current UI version

### 6) Captcha Solving

Symptoms:
- Captchas remain unsolved or time out
- Low success rate

Checks:
- `TWOCAPTCHA_API_KEY` and account balance
- Captcha timeout: `CAPTCHA_TIMEOUT`
- Logs showing captcha type and solve times

Fixes:
- Increase timeout
- Fund captcha account or rotate to another service
- Reduce concurrency to avoid triggering captchas

### 7) File System and Permissions

Symptoms:
- Cannot write logs, registrations, or screenshots
- Cleanup errors

Checks:
- Verify the app has write permissions to `./logs` and `./temp`
- Windows path issues

Fixes:
- Run terminal with appropriate privileges
- Ensure directories are created (setup wizard does this)
- Use cleanup script to remove stale artifacts

---

## Recovery and Cleanup

- Rotate/compress large logs and prune old artifacts:
  - `node scripts/cleanup.js --force`
  - Large logs are gzip-compressed, old logs deleted based on retention
- Remove stale profiles:
  - `node scripts/cleanup.js --force --no-logs` (to focus on profiles)
- Reset counters:
  - `node scripts/cleanup.js --reset`

---

## Advanced Diagnostics

- Enable debug and visible browser:
  - `DEBUG_MODE=true BROWSER_HEADLESS=false npm start`
- Capture artifacts on errors:
  - `SCREENSHOT_ON_ERROR=true SAVE_HTML_ON_ERROR=true`
- Inspect per-registration data:
  - Registration JSON will include `proxy.ip` for traceability

---

## FAQ

Q: Is Dolphin Anty required?
- No. The system launches a regular stealth browser when Anty is not configured or profile creation fails. Use `--use-dolphin` only if you want to enforce Anty usage along with a valid token.

Q: Why is exit IP missing in results?
- Ensure the proxy connectivity test succeeds. The working proxy now includes `ip` on success, and the result object uses that value.

Q: Can I run a dry run without creating any accounts?
- Yes. Use `--dry-run` or pass `dryRun: true` with `skipAccountCreation` and `skipKilocodeRegistration`. The flow will launch and close a browser and return a `dry_run_completed` status.

Q: Where do I find API usage?
- See [API Reference](./API_REFERENCE.md).

Q: How do I deploy to production?
- See [Deployment Guide](./DEPLOYMENT.md) for hardening, scaling, monitoring, and security guidance.

Q: Where is a test overview?
- See [Testing Guide](../TESTING.md) for strategy, commands, and acceptance criteria.