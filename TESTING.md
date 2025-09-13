# Kilocode Automation System - Testing Guide

This document outlines the testing strategy, how to run the provided test suites, and acceptance criteria for verifying the system.

## Table of Contents
- Test Strategy
- Test Suites
  - Environment Tests
  - Proxy Tests
  - Google Workflow Tests
  - Kilocode Workflow Tests
  - Integration Tests
- How to Run
- CI/Exit Codes
- Acceptance Criteria
- Tips and Troubleshooting

---

## Test Strategy

The project adopts a layered testing approach:

1) Environment and Sanity Checks
- Validate Node version, environment variables, and file system prerequisites.
- Fast feedback to prevent running without required configs.

2) Component Tests
- Proxy connectivity and session handling.
- Google account creation workflow (mock-friendly where applicable).
- Kilocode OAuth registration and bonus collection.

3) Integration Tests (E2E)
- Validates the full pipeline:
  - Obtain working proxy and capture exit IP
  - Optional Dolphin Anty profile creation and fallback to regular stealth
  - Browser launch
  - Optional account creation and Kilocode registration
  - Bonus collection and result persistence

4) Operational Tests (Health/Setup/Cleanup)
- Setup wizard: dependency installation, directory creation, environment configuration.
- Health checks and cleanup tasks (compression and retention policies).

---

## Test Suites

### Environment Tests

Script:
- `tests/test-environment.js`

Validates:
- Node version compatibility
- Core environment variables exist
- Filesystem permissions for logs and temp directories
- Dependencies presence/versions

Run:
```bash
npm run test:env
```

Expected:
- Exit code 0 on success
- Actionable error output if failures occur

---

### Proxy Tests

Script:
- `tests/test-proxy.js`

Validates:
- Proxy configuration setup
- Connectivity through proxy, capturing exit IP
- Response time and reliability

Run:
```bash
npm run test:proxy
```

Expected:
- Successful HTTP request through proxy
- Printed/Logged exit IP (now included in working proxy result)

---

### Google Workflow Tests

Script:
- `tests/test-google.js`

Validates:
- Core steps of Google signup in a controlled/test-safe manner
- Robustness to minor UI changes (subject to updates)

Run:
```bash
npm run test:google
```

Notes:
- For headful debugging, run with `BROWSER_HEADLESS=false`
- For additional artifacts on failure, set:
  - `SCREENSHOT_ON_ERROR=true`
  - `SAVE_HTML_ON_ERROR=true`

---

### Kilocode Workflow Tests

Script:
- `tests/test-kilocode.js`

Validates:
- OAuth-based registration
- Account linking with Google
- Bonus collection routines

Run:
```bash
npm run test:kilocode
```

Expected:
- Successful navigation and status reporting
- Optional API key collection (masked in logs)

---

### Integration Tests

Script:
- `tests/test-integration.js`

Covers:
- End-to-end flow with proxy + browser + optional Dolphin Anty
- Dry run mode workflow with status contract
- Full run (optional) that may create real accounts (USE WITH CAUTION)
- Error recovery and cleanup routines

Run (basic, no real account creation):
```bash
node tests/test-integration.js
```

Run (full, creates real accounts):
```bash
RUN_FULL_INTEGRATION=true node tests/test-integration.js
```

Expected (Dry Run):
- Status: `dry_run_completed`
- Includes: `duration`, `profileCreated` (boolean), `browserLaunched: true`

Expected (Full Run):
- Status: `completed`
- Includes result data with:
  - `registrationId`
  - `userData` (with `password: '[HIDDEN]'`)
  - `googleAccount` (email, etc.)
  - `kilocodeAccount` (status, optional apiKey masked in logs)
  - `bonuses` (array)
  - `profileId` (nullable if regular stealth path)
  - `proxy: { sessionId, ip }` (non-empty ip when connectivity was verified)
  - `timestamp`

---

## How to Run

Single suite:
```bash
npm run test:env
npm run test:proxy
npm run test:google
npm run test:kilocode
node tests/test-integration.js
```

All suites (including integration):
```bash
npm test
```

Headful, verbose debugging (example):
```bash
DEBUG_MODE=true BROWSER_HEADLESS=false npm run test:int
```

---

## CI/Exit Codes

- Environment, proxy, google, kilocode tests:
  - Exit code 0 = Pass
  - Exit code 1 = Failure

- Integration test:
  - Exit code reflects the number of failed tests
  - Non-zero on any failure
  - Optional Full Run is skipped unless `RUN_FULL_INTEGRATION=true`

Ensure CI uses:
```bash
npm run test:env && npm run test:proxy && npm run test:google && npm run test:kilocode && npm run test:int
```

---

## Acceptance Criteria

Layered criteria baseline:

1) Environment
- No missing core proxy environment variables
- Node version satisfies engines
- Filesystem directories created

2) Proxy
- Proxy test resolves exit IP (non-empty)
- Acceptable latency and reliability

3) Component Flows
- Google workflow navigations stable with configured delays/timeouts
- Kilocode registration returns a consistent status
- Optional bonus collection succeeds or safely times out with clear errors

4) Integration
- Dry run returns status `dry_run_completed` with browser launched/closed
- Full run returns status `completed` and includes result data
- Registration JSON saved with required fields and masked secrets

5) Logs and Artifacts
- Log rotation and compression working
- Errors and events recorded with context
- Screenshots/HTML saved on demand

---

## Tips and Troubleshooting

- Use headful mode and `DEBUG_MODE=true` to observe flows.
- Increase `BROWSER_TIMEOUT` and add delays if pages throttle automation.
- Ensure proxies are stable and geographically suitable for target flows.
- Confirm optional Dolphin Anty is either properly configured or not enforced.
- When diagnosing issues, consult:
  - `docs/TROUBLESHOOTING.md`
  - `docs/API_REFERENCE.md`
  - `DEPLOYMENT.md`
  - `docs/SETUP_GUIDE.md`
  - `docs/USAGE_GUIDE.md`