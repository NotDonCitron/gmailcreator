# Kilocode Automation System - Deployment Guide

This guide outlines recommended practices for deploying the automation system to production environments, including environment variables, security, scaling, monitoring, backups, and operational runbooks.

## Table of Contents
- Deployment Models
- Environment Configuration
- Production Hardening
- Scaling and Performance
- Monitoring and Alerting
- Backups and Disaster Recovery
- Security and Compliance
- Operations Runbook
- Change Management

---

## Deployment Models

1) Single-Host Deployment (recommended start)
- One machine running Node.js and dependencies
- Suitable for small/medium throughput
- Easier debugging and operations

2) Multi-Host Deployment
- Multiple worker nodes
- Centralized logging/metrics backends
- Requires orchestration (PM2, Docker, Nomad, Kubernetes)

3) Containerized Deployment
- Docker images with pinned Node and OS libs
- Orchestrate with Docker Compose or Kubernetes for scaling

---

## Environment Configuration

Base variables (proxy required):
- PROXY_HOST, PROXY_PORT, PROXY_USERNAME, PROXY_PASSWORD, PROXY_TYPE

Optional Dolphin Anty (only when used):
- DOLPHIN_ANTY_TOKEN (presence implies DOLPHIN_ANTY_HOST is required)
- DOLPHIN_ANTY_HOST (when token is present or --use-dolphin flag is used)

Browser and automation:
- BROWSER_HEADLESS=true
- BROWSER_TIMEOUT=30000
- SLOW_MO=0..200 (increase for stability in some environments)
- CONCURRENT_INSTANCES=1..N
- REGISTRATION_BATCH_SIZE=10
- MAX_RETRIES=3
- RETRY_DELAY=30000

Logging:
- LOG_LEVEL=info (set to debug temporarily if needed)
- LOG_TO_FILE=true
- LOG_TO_CONSOLE=true
- LOG_ROTATION_SIZE=10m
- LOG_RETENTION_DAYS=30

Diagnostics (optional for SRE workflows):
- DEBUG_MODE=false
- SCREENSHOT_ON_ERROR=true
- SAVE_HTML_ON_ERROR=false

Captchas:
- CAPTCHA_SERVICE=2captcha
- TWOCAPTCHA_API_KEY=...

---

## Production Hardening

- Pin Node.js LTS version (>= 18 recommended)
- Lock dependency versions using package-lock.json
- Use a process manager (PM2/systemd) for auto-restart
- Set memory and CPU limits (container resource quotas)
- Enable daily log rotation (already configured with zipped archives)
- Enforce `.env` permissions (0600 on Linux; restricted ACLs on Windows)
- Configure OS networking for consistent DNS and low-latency proxy routing
- Validate proxy pool health periodically (scheduled `npm run test:proxy`)
- Disable unnecessary OS services on hosts

Network and access:
- Restrict outbound/inbound as needed via firewall
- Limit access to Anty API endpoint to trusted hosts
- Use secrets manager for .env where possible

---

## Scaling and Performance

Vertical scaling:
- Increase `CONCURRENT_INSTANCES` gradually
- Monitor CPU, memory, open file descriptors
- Use headless mode to reduce overhead
- Adjust `BROWSER_TIMEOUT` and delays for stability

Horizontal scaling:
- Run multiple instances on separate hosts
- Ensure proxies support enough sessions for parallelism
- Separate runs by `PROXY_SESSION_OFFSET` strategy if supported by provider

Queue-based scaling (advanced):
- Externalize job queue (e.g., Redis, RabbitMQ)
- Workers pull registration tasks
- Centralize results and logs

---

## Monitoring and Alerting

Metrics to track:
- Success/failure rate (per hour/day)
- Proxy health: working session count, average response time, exit IP churn
- Captcha solve time and error rate
- Browser launch failures
- Memory/CPU of workers

Log monitoring:
- Collect `logs/*` to centralized backend (ELK/Datadog/Splunk)
- Alert on error spikes or consecutive failures
- Monitor registration JSONs for anomalies (missing IPs, NULL fields)

Health checks:
- `node scripts/health-check.js` can be scheduled
- Exit codes are compatible with CI checks

Alert thresholds (examples):
- Failure rate > 20% over last 50 runs
- Proxy test failure > 3 consecutive attempts
- Browser launch failure > 5% within 30 mins
- Captcha solve timeout > 2x baseline

---

## Backups and Disaster Recovery

Artifacts:
- Logs: Rotated and zipped; retain for 30–90 days as needed
- Registration JSONs: Keep critical data, sanitize secrets
- Config: Store `.env` securely (hashicorp Vault/Azure Key Vault/AWS Secrets Manager)

Backups:
- Archive logs and registration JSONs daily to object storage
- Version control documentation and deployment configs
- Snapshot worker VM or container volumes if needed

Recovery:
- Provision a fresh worker host/container
- Restore `.env` from secrets manager
- Pull code and run setup or health check
- Validate proxy and captcha connectivity, then resume

---

## Security and Compliance

- Never commit real `.env` to VCS
- Rotate proxy and captcha API credentials periodically
- Limit user access on worker nodes
- Harden OS (disable RDP/SMB unless needed; use SSH keys; patch regularly)
- Review logs for PII; sanitize sensitive fields at emission (already enforced)
- Ensure legal compliance for automation usage in your jurisdiction

---

## Operations Runbook

Day 1:
- Validate environment and connectivity
  - `npm run test:env`
  - `npm run test:proxy`
- Run integration suite (basic mode)
  - `node tests/test-integration.js`

Daily:
- Review error logs and metrics
- Run `node scripts/health-check.js`
- Optional weekly `node scripts/cleanup.js --force`

Incident:
- Gather logs and registration JSONs
- Verify proxy health and captcha balances
- Run in visible browser with debug: `DEBUG_MODE=true BROWSER_HEADLESS=false npm start -- --batch 1`
- Execute cleanup if temp artifacts accumulate

---

## Change Management

- Use feature branches and PR reviews
- Update `TESTING.md` with new acceptance criteria
- Tag releases, maintain changelog
- Roll out changes gradually; canary one worker before fleet-wide updates
