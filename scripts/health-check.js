#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const { HttpsProxyAgent } = require('https-proxy-agent');

const ProxyManager = require('../config/proxies');
const logger = require('../utils/logger');

class HealthMonitor {
    constructor() {
        this.proxyManager = new ProxyManager();
        this.healthData = {
            timestamp: new Date().toISOString(),
            overall: 'unknown',
            services: {},
            metrics: {},
            alerts: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}]`;

        switch (type) {
            case 'success':
                console.log(chalk.green(`${prefix} ✅ ${message}`));
                break;
            case 'error':
                console.log(chalk.red(`${prefix} ❌ ${message}`));
                break;
            case 'warning':
                console.log(chalk.yellow(`${prefix} ⚠️  ${message}`));
                break;
            case 'info':
            default:
                console.log(chalk.blue(`${prefix} ℹ  ${message}`));
        }
    }

    async runHealthCheck() {
        console.log(chalk.cyan('🏥 System Health Check'));
        console.log(chalk.yellow('=' .repeat(30)));
        console.log(`Started at: ${this.healthData.timestamp}\n`);

        try {
            // Check all system components
            await this.checkSystemResources();
            await this.checkProxyHealth();
            await this.checkDolphinAntyService();
            await this.checkCaptchaService();
            await this.checkFileSystem();
            await this.checkLogFiles();
            await this.checkPerformanceMetrics();

            // Determine overall health
            this.determineOverallHealth();

            // Generate report
            this.generateReport();

            // Save health report
            await this.saveHealthReport();

        } catch (error) {
            this.log(`Health check failed: ${error.message}`, 'error');
            this.healthData.overall = 'critical';
            this.healthData.alerts.push({
                level: 'critical',
                message: `Health check failed: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    }

    async checkSystemResources() {
        this.log('Checking system resources...');

        try {
            const used = process.memoryUsage();
            const totalMemoryMB = Math.round(used.rss / 1024 / 1024);
            const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);

            this.healthData.metrics.memory = {
                rss: totalMemoryMB,
                heapUsed: heapUsedMB,
                heapTotal: heapTotalMB,
                external: Math.round(used.external / 1024 / 1024),
                arrayBuffers: Math.round(used.arrayBuffers / 1024 / 1024)
            };

            // Check memory usage thresholds
            if (totalMemoryMB > 1000) {
                this.healthData.alerts.push({
                    level: 'warning',
                    message: `High memory usage: ${totalMemoryMB}MB RSS`,
                    timestamp: new Date().toISOString()
                });
            }

            // Check Node.js version
            const nodeVersion = process.version;
            this.healthData.metrics.nodejs = {
                version: nodeVersion,
                uptime: Math.round(process.uptime())
            };

            this.healthData.services.system = {
                status: 'healthy',
                memory: `${totalMemoryMB}MB`,
                nodeVersion: nodeVersion,
                uptime: `${Math.round(process.uptime())}s`
            };

            this.log(`System resources OK (Memory: ${totalMemoryMB}MB, Node: ${nodeVersion})`, 'success');

        } catch (error) {
            this.log(`System resource check failed: ${error.message}`, 'error');
            this.healthData.services.system = {
                status: 'error',
                error: error.message
            };
        }
    }

    async checkProxyHealth() {
        this.log('Checking proxy connectivity...');

        try {
            const startTime = Date.now();

            // Test basic proxy connection
            const proxyTest = await this.proxyManager.testProxyConnection();
            const responseTime = Date.now() - startTime;

            if (proxyTest.success) {
                // Test multiple sessions
                const sessionTests = await this.proxyManager.testAllSessions();
                const workingSessions = sessionTests.filter(s => s.success).length;
                const totalSessions = sessionTests.length;
                const successRate = (workingSessions / totalSessions) * 100;

                this.healthData.services.proxy = {
                    status: successRate >= 70 ? 'healthy' : 'degraded',
                    ip: proxyTest.ip,
                    responseTime: responseTime,
                    workingSessions: workingSessions,
                    totalSessions: totalSessions,
                    successRate: successRate
                };

                this.healthData.metrics.proxy = {
                    responseTime: responseTime,
                    successRate: successRate,
                    workingSessions: workingSessions
                };

                if (successRate < 50) {
                    this.healthData.alerts.push({
                        level: 'critical',
                        message: `Low proxy success rate: ${successRate.toFixed(1)}%`,
                        timestamp: new Date().toISOString()
                    });
                } else if (successRate < 70) {
                    this.healthData.alerts.push({
                        level: 'warning',
                        message: `Degraded proxy performance: ${successRate.toFixed(1)}%`,
                        timestamp: new Date().toISOString()
                    });
                }

                this.log(`Proxy health OK (${workingSessions}/${totalSessions} sessions, ${responseTime}ms)`, 'success');

            } else {
                throw new Error(proxyTest.error);
            }

        } catch (error) {
            this.log(`Proxy health check failed: ${error.message}`, 'error');
            this.healthData.services.proxy = {
                status: 'error',
                error: error.message
            };

            this.healthData.alerts.push({
                level: 'critical',
                message: `Proxy connection failed: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    }

    async checkDolphinAntyService() {
        this.log('Checking Dolphin Anty service...');

        try {
            const host = process.env.DOLPHIN_ANTY_HOST;
            const token = process.env.DOLPHIN_ANTY_TOKEN;

            if (!token || token === 'your_dolphin_anty_token_here') {
                this.healthData.services.dolphinAnty = {
                    status: 'not_configured',
                    message: 'API token not configured'
                };
                this.log('Dolphin Anty not configured (optional)', 'warning');
                return;
            }

            const startTime = Date.now();
            const response = await axios.get(`${host}/v1.0/browser_profiles`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;

            if (response.status === 200) {
                const profiles = response.data.data || [];

                this.healthData.services.dolphinAnty = {
                    status: 'healthy',
                    profileCount: profiles.length,
                    responseTime: responseTime,
                    apiVersion: response.data.version || 'unknown'
                };

                this.healthData.metrics.dolphinAnty = {
                    responseTime: responseTime,
                    profileCount: profiles.length
                };

                this.log(`Dolphin Anty OK (${profiles.length} profiles, ${responseTime}ms)`, 'success');

            } else {
                throw new Error(`HTTP ${response.status}`);
            }

        } catch (error) {
            let status = 'error';
            let message = error.message;

            if (error.code === 'ECONNREFUSED') {
                status = 'unavailable';
                message = 'Service not running';
            } else if (error.response?.status === 401) {
                status = 'auth_error';
                message = 'Authentication failed';
            }

            this.log(`Dolphin Anty check failed: ${message}`, 'error');
            this.healthData.services.dolphinAnty = {
                status: status,
                error: message
            };

            this.healthData.alerts.push({
                level: 'warning',
                message: `Dolphin Anty service issue: ${message}`,
                timestamp: new Date().toISOString()
            });
        }
    }

    async checkCaptchaService() {
        this.log('Checking captcha service...');

        try {
            const apiKey = process.env.TWOCAPTCHA_API_KEY;
            const service = process.env.CAPTCHA_SERVICE || '2captcha';

            if (!apiKey || apiKey === 'your_2captcha_api_key_here') {
                this.healthData.services.captcha = {
                    status: 'not_configured',
                    message: 'API key not configured'
                };
                this.log('Captcha service not configured (optional)', 'warning');
                return;
            }

            if (service === '2captcha') {
                const startTime = Date.now();
                const response = await axios.post('http://2captcha.com/res.php', null, {
                    params: {
                        key: apiKey,
                        action: 'getbalance'
                    },
                    timeout: 10000
                });

                const responseTime = Date.now() - startTime;

                if (response.data.startsWith('OK|')) {
                    const balance = parseFloat(response.data.split('|')[1]);

                    this.healthData.services.captcha = {
                        status: balance > 1 ? 'healthy' : 'low_balance',
                        balance: balance,
                        service: '2captcha',
                        responseTime: responseTime
                    };

                    this.healthData.metrics.captcha = {
                        balance: balance,
                        responseTime: responseTime
                    };

                    if (balance < 1) {
                        this.healthData.alerts.push({
                            level: 'warning',
                            message: `Low 2captcha balance: $${balance}`,
                            timestamp: new Date().toISOString()
                        });
                    }

                    this.log(`2captcha OK (Balance: $${balance}, ${responseTime}ms)`, 'success');

                } else {
                    throw new Error(`API error: ${response.data}`);
                }

            } else {
                this.healthData.services.captcha = {
                    status: 'unknown',
                    service: service,
                    message: 'Unsupported service type'
                };
                this.log(`Unknown captcha service: ${service}`, 'warning');
            }

        } catch (error) {
            this.log(`Captcha service check failed: ${error.message}`, 'error');
            this.healthData.services.captcha = {
                status: 'error',
                error: error.message
            };

            this.healthData.alerts.push({
                level: 'warning',
                message: `Captcha service issue: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    }

    async checkFileSystem() {
        this.log('Checking file system...');

        try {
            const directories = ['logs', 'temp', 'temp/profiles', 'temp/screenshots'];
            const fileSystemInfo = {
                directories: {},
                permissions: 'ok'
            };

            for (const dir of directories) {
                try {
                    const stats = fs.statSync(dir);
                    const files = fs.readdirSync(dir);

                    fileSystemInfo.directories[dir] = {
                        exists: true,
                        isDirectory: stats.isDirectory(),
                        fileCount: files.length,
                        size: this.getDirectorySize(dir)
                    };

                    // Test write permissions
                    const testFile = path.join(dir, '.health-check-test');
                    fs.writeFileSync(testFile, 'test');
                    fs.unlinkSync(testFile);

                } catch (dirError) {
                    fileSystemInfo.directories[dir] = {
                        exists: false,
                        error: dirError.message
                    };

                    if (dirError.code === 'ENOENT') {
                        // Try to create directory
                        fs.mkdirSync(dir, { recursive: true });
                        fileSystemInfo.directories[dir] = {
                            exists: true,
                            created: true
                        };
                    } else {
                        fileSystemInfo.permissions = 'error';
                    }
                }
            }

            this.healthData.services.filesystem = {
                status: fileSystemInfo.permissions === 'ok' ? 'healthy' : 'error',
                directories: fileSystemInfo.directories
            };

            this.log('File system OK', 'success');

        } catch (error) {
            this.log(`File system check failed: ${error.message}`, 'error');
            this.healthData.services.filesystem = {
                status: 'error',
                error: error.message
            };
        }
    }

    async checkLogFiles() {
        this.log('Checking log files...');

        try {
            const logsDir = 'logs';
            let logInfo = {
                totalFiles: 0,
                totalSize: 0,
                oldestLog: null,
                newestLog: null,
                rotationNeeded: false
            };

            if (fs.existsSync(logsDir)) {
                const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
                logInfo.totalFiles = logFiles.length;

                for (const file of logFiles) {
                    const filePath = path.join(logsDir, file);
                    const stats = fs.statSync(filePath);
                    logInfo.totalSize += stats.size;

                    if (!logInfo.oldestLog || stats.mtime < logInfo.oldestLog.mtime) {
                        logInfo.oldestLog = { file, mtime: stats.mtime };
                    }

                    if (!logInfo.newestLog || stats.mtime > logInfo.newestLog.mtime) {
                        logInfo.newestLog = { file, mtime: stats.mtime };
                    }

                    // Check if file is too large (> 10MB)
                    if (stats.size > 10 * 1024 * 1024) {
                        logInfo.rotationNeeded = true;
                    }
                }
            }

            this.healthData.services.logs = {
                status: 'healthy',
                totalFiles: logInfo.totalFiles,
                totalSizeMB: Math.round(logInfo.totalSize / 1024 / 1024),
                rotationNeeded: logInfo.rotationNeeded
            };

            this.healthData.metrics.logs = {
                totalFiles: logInfo.totalFiles,
                totalSize: logInfo.totalSize
            };

            if (logInfo.rotationNeeded) {
                this.healthData.alerts.push({
                    level: 'info',
                    message: 'Log rotation recommended (files > 10MB detected)',
                    timestamp: new Date().toISOString()
                });
            }

            this.log(`Log files OK (${logInfo.totalFiles} files, ${Math.round(logInfo.totalSize / 1024 / 1024)}MB)`, 'success');

        } catch (error) {
            this.log(`Log files check failed: ${error.message}`, 'error');
            this.healthData.services.logs = {
                status: 'error',
                error: error.message
            };
        }
    }

    async checkPerformanceMetrics() {
        this.log('Collecting performance metrics...');

        try {
            // Get current performance stats
            const perfStart = process.hrtime();
            const cpuStart = process.cpuUsage();

            // Simulate a small workload
            await this.delay(100);

            const perfEnd = process.hrtime(perfStart);
            const cpuEnd = process.cpuUsage(cpuStart);

            this.healthData.metrics.performance = {
                cpuUser: cpuEnd.user,
                cpuSystem: cpuEnd.system,
                executionTime: perfEnd[0] * 1000 + perfEnd[1] / 1e6, // Convert to milliseconds
                timestamp: new Date().toISOString()
            };

            this.log('Performance metrics collected', 'success');

        } catch (error) {
            this.log(`Performance check failed: ${error.message}`, 'error');
        }
    }

    determineOverallHealth() {
        const services = this.healthData.services;
        const criticalServices = ['system', 'proxy'];
        const optionalServices = ['dolphinAnty', 'captcha'];

        let healthyCount = 0;
        let errorCount = 0;
        let totalCritical = 0;

        // Check critical services
        for (const service of criticalServices) {
            totalCritical++;
            if (services[service]?.status === 'healthy') {
                healthyCount++;
            } else if (services[service]?.status === 'error') {
                errorCount++;
            }
        }

        // Determine overall status
        if (errorCount > 0) {
            this.healthData.overall = 'critical';
        } else if (healthyCount === totalCritical) {
            this.healthData.overall = 'healthy';
        } else {
            this.healthData.overall = 'degraded';
        }

        // Check for any critical alerts
        const criticalAlerts = this.healthData.alerts.filter(a => a.level === 'critical');
        if (criticalAlerts.length > 0 && this.healthData.overall !== 'critical') {
            this.healthData.overall = 'critical';
        }
    }

    generateReport() {
        console.log('\n' + '='.repeat(50));
        console.log(chalk.cyan('📊 Health Check Report'));
        console.log('='.repeat(50));

        // Overall status
        const statusColor = {
            'healthy': 'green',
            'degraded': 'yellow',
            'critical': 'red'
        }[this.healthData.overall] || 'gray';

        console.log(`Overall Status: ${chalk[statusColor](this.healthData.overall.toUpperCase())}`);
        console.log(`Check Time: ${this.healthData.timestamp}`);

        // Services status
        console.log('\n📋 Services:');
        Object.entries(this.healthData.services).forEach(([service, data]) => {
            const statusIcon = {
                'healthy': '✅',
                'degraded': '⚠️',
                'error': '❌',
                'not_configured': '⚪',
                'unavailable': '🔴'
            }[data.status] || '❓';

            console.log(`  ${statusIcon} ${service}: ${data.status}`);

            if (data.error) {
                console.log(`     Error: ${data.error}`);
            }
        });

        // Metrics
        if (Object.keys(this.healthData.metrics).length > 0) {
            console.log('\n📈 Metrics:');
            if (this.healthData.metrics.memory) {
                console.log(`  Memory: ${this.healthData.metrics.memory.rss}MB RSS`);
            }
            if (this.healthData.metrics.proxy) {
                console.log(`  Proxy: ${this.healthData.metrics.proxy.responseTime}ms response`);
            }
            if (this.healthData.metrics.logs) {
                console.log(`  Logs: ${this.healthData.metrics.logs.totalFiles} files (${Math.round(this.healthData.metrics.logs.totalSize / 1024 / 1024)}MB)`);
            }
        }

        // Alerts
        if (this.healthData.alerts.length > 0) {
            console.log('\n🚨 Alerts:');
            this.healthData.alerts.forEach(alert => {
                const alertIcon = {
                    'critical': '🔴',
                    'warning': '⚠️',
                    'info': 'ℹ️'
                }[alert.level] || '📢';

                console.log(`  ${alertIcon} ${alert.level.toUpperCase()}: ${alert.message}`);
            });
        } else {
            console.log('\n✅ No alerts');
        }

        console.log('\n' + '='.repeat(50));
    }

    async saveHealthReport() {
        try {
            const reportPath = path.join('logs', `health-report-${Date.now()}.json`);
            fs.writeFileSync(reportPath, JSON.stringify(this.healthData, null, 2));
            this.log(`Health report saved to: ${reportPath}`, 'info');
        } catch (error) {
            this.log(`Failed to save health report: ${error.message}`, 'warning');
        }
    }

    getDirectorySize(dirPath) {
        let totalSize = 0;
        try {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    totalSize += stats.size;
                }
            });
        } catch (error) {
            // Ignore errors
        }
        return totalSize;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const helpFlag = args.includes('--help') || args.includes('-h');
    const quietFlag = args.includes('--quiet') || args.includes('-q');
    const jsonFlag = args.includes('--json');

    if (helpFlag) {
        console.log(chalk.cyan('System Health Check Monitor'));
        console.log('\nUsage: node scripts/health-check.js [options]');
        console.log('\nOptions:');
        console.log('  --help, -h     Show this help message');
        console.log('  --quiet, -q    Minimal output');
        console.log('  --json         Output results in JSON format');
        console.log('\nThis script monitors:');
        console.log('  - System resources (memory, Node.js)');
        console.log('  - Proxy connectivity and performance');
        console.log('  - Dolphin Anty service status');
        console.log('  - Captcha service balance and connectivity');
        console.log('  - File system permissions');
        console.log('  - Log file status and rotation needs');
        console.log('  - Overall system performance');
        console.log('\nExit Codes:');
        console.log('  0: System healthy');
        console.log('  1: System has warnings');
        console.log('  2: System has critical issues');
        process.exit(0);
    }

    const monitor = new HealthMonitor();

    try {
        await monitor.runHealthCheck();

        if (jsonFlag) {
            console.log(JSON.stringify(monitor.healthData, null, 2));
        }

        // Exit with appropriate code
        const exitCode = {
            'healthy': 0,
            'degraded': 1,
            'critical': 2
        }[monitor.healthData.overall] || 1;

        process.exit(exitCode);

    } catch (error) {
        console.error(chalk.red('Health check failed:'), error.message);
        process.exit(2);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('Unhandled error:'), error);
        process.exit(2);
    });
}

module.exports = HealthMonitor;