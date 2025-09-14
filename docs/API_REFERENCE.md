# Kilocode Automation System - API Reference

This document describes the public classes, methods, and return contracts for programmatic usage. It reflects the integration test API and the optional Dolphin Anty flow.

## Table of Contents
- Overview
- Classes
  - KilocodeAutomation
  - StealthBrowser
  - GoogleAccount
  - KilocodeRegistration
  - ProxyManager
  - DolphinAnty
- Usage Examples
- Return Shapes and Status Contracts

---

## Overview

The system orchestrates a complete account registration pipeline using a stealth browser, rotating proxies, optional Dolphin Anty profiles, and providers for Google/Kilocode flows.

Key behaviors:
- Optional Dolphin Anty. When not configured or when profile creation fails, the system falls back to regular Puppeteer launch.
- Proxy exit IP is captured and included in results for traceability.
- Single-run flow supports dry-run and selective skipping of steps.
- Batch runs summarize results using the new status-based contract.

---

## Classes

### KilocodeAutomation

Source: [src/main.js](../src/main.js)

Constructor:
- new KilocodeAutomation(options?: object)

Options (partial):
- mode: string = 'production'
- batchSize: number = 1
- concurrentInstances: number = 1
- headless: boolean = true
- debug: boolean = false

Methods:
- async runSingleRegistration(overrideOpts = {}): Promise<RunSingleRegistrationResult>
- async runBatch(): Promise<BatchSummary>

runSingleRegistration override options:
- dryRun?: boolean
- skipAccountCreation?: boolean
- skipKilocodeRegistration?: boolean
- headless?: boolean
- debug?: boolean

Status contract:
- Dry run:
  - { status: 'dry_run_completed', duration: number, profileCreated: boolean, browserLaunched: true }
- Success:
  - {
      status: 'completed',
      duration: number,
      data: {
        registrationId: string,
        userData: object (password: '[HIDDEN]'),
        googleAccount: object|null,
        kilocodeAccount: object|null,
        bonuses: any[],
        profileId: string|null,
        proxy: { sessionId: number, ip: string|null },
        timestamp: ISOString
      }
    }
- Failure:
  - { status: 'failed', error: string, shouldRetry: boolean, timestamp: ISOString }

Batch summary (runBatch):
- {
    batchId: string,
    totalRegistrations: number,
    successful: number,   // count of results with status === 'completed'
    failed: number,       // count of results with status === 'failed'
    duration: number,     // seconds
    results: RunSingleRegistrationResult[]
  }

Notes:
- Always attempts to obtain a working proxy first.
- Conditionally creates a Dolphin Anty profile if configured; otherwise uses a regular stealth launch.
- Saves successful registration JSON to logs directory with sensitive fields sanitized.

### StealthBrowser

Source: [src/stealth-browser.js](../src/stealth-browser.js)

Constructor:
- new StealthBrowser()

Methods:
- async launch(profileIdOrNull: string|null, options: { headless?: boolean, debug?: boolean, proxy?: ProxyConfig }): Promise<Browser>
- async createStealthPage(browser, options?): Promise<Page>
- async cleanupProxy(): Promise<void>

Behavior:
- When profileId is provided: connects to Dolphin Anty (via WebSocket endpoint).
- When profileId is null: performs a regular puppeteer-extra launch with stealth plugin.
- If a proxy with credentials is provided, uses proxy-chain to anonymize and configures Chromium args.

### GoogleAccount

Source: [src/google-account.js](../src/google-account.js)

Primary method:
- async create(browser: Browser, userData: object): Promise<GoogleAccount>

Return (example shape):
- {
    email: string,
    recoveryEmail?: string,
    phoneVerified?: boolean,
    profile?: object
  }

### KilocodeRegistration

Source: [src/kilocode-registration.js](../src/kilocode-registration.js)

Methods:
- async register(browser: Browser, googleAccount: GoogleAccount): Promise<KilocodeAccount>
- async collectBonuses(browser: Browser): Promise<any[]>

Return (example shapes):
- KilocodeAccount: { status: 'registered'|'pending'|'failed', apiKey?: string, details?: object }
- Bonuses: array of bonus descriptors

### ProxyManager

Source: [config/proxies.js](../config/proxies.js)

Constructor:
- new ProxyManager()

Methods:
- async getWorkingProxy(): Promise<WorkingProxy>
- async testProxyConnection(sessionId?: number): Promise<{ success: boolean, ip?: string, error?: string }>
- getProxyString(sessionId?: number): string
- rotateProxy(): Promise<ProxyDescriptor>

WorkingProxy:
- {
    proxyString: string,
    sessionId: number,
    host: string,
    port: number,
    username: string,
    password: string,
    type: string,
    ip: string       // Captured after successful connection test
  }

Notes:
- getWorkingProxy() validates connectivity and sets exit IP on the returned object.

### DolphinAnty

Source: [src/dolphin-anty.js](../src/dolphin-anty.js)

Common methods (subject to implementation details):
- async createProfile({ name, userData, proxy? }): Promise<string>  // returns profileId
- async startProfile(profileId: string): Promise<{ wsEndpoint: string }>
- async deleteProfile(profileId: string): Promise<void>
- async getProfiles(): Promise<Profile[]>

Notes:
- Optional. Use only when configured via environment or CLI `--use-dolphin`.

---

## Usage Examples

For more detailed information, see:
- [Troubleshooting Guide](./TROUBLESHOOTING.md) for solving problems
- [Deployment Guide](./DEPLOYMENT.md) for production setup

Programmatic single registration:
```javascript
const KilocodeAutomation = require('./src/main');

(async () => {
  const automation = new KilocodeAutomation({ headless: true, debug: false });
  const result = await automation.runSingleRegistration({
    dryRun: false,
    skipAccountCreation: false,
    skipKilocodeRegistration: false
  });

  if (result.status === 'completed') {
    console.log('Registration complete:', result.data.registrationId);
  } else if (result.status === 'failed') {
    console.error('Failed:', result.error, 'Retry?', result.shouldRetry);
  }
})();
```

Dry run:
```javascript
const automation = new (require('./src/main'))();
const result = await automation.runSingleRegistration({
  dryRun: true,
  skipAccountCreation: true,
  skipKilocodeRegistration: true
});
// result.status === 'dry_run_completed'
```

---

## Return Shapes and Status Contracts

runSingleRegistration():
- Success: see KilocodeAutomation above.
- Dry run: includes duration, profileCreated, browserLaunched.
- Failure: includes shouldRetry from the error handler and timestamp.

runBatch():
- Counts successes by `status === 'completed'`.
- Includes the raw per-invocation results array for post-processing.
