const logger = require('../utils/logger');

class ProxyManager {
    constructor() {
        // Proxy configuration from environment variables
        this.proxyConfig = {
            host: process.env.PROXY_HOST,
            port: parseInt(process.env.PROXY_PORT),
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD,
            type: process.env.PROXY_TYPE || 'http'
        };

        this.currentSessionIndex = 0;
        this.maxSessions = 10; // iProxy typically allows multiple sessions
        this.sessionPrefix = 'session';

        // Health check tracking
        this.healthStats = {
            totalChecks: 0,
            successfulChecks: 0,
            lastCheckTime: null,
            lastCheckStatus: null
        };

        logger.info('🌐 Proxy Manager initialized with iProxy configuration');
        logger.debug('Proxy host:', `${this.proxyConfig.host}:${this.proxyConfig.port}`);
    }

    getProxyString(sessionId = null) {
        const { host, port, username, password, type } = this.proxyConfig;

        let finalUsername = username;

        // Add session ID for rotation if provided
        if (sessionId) {
            finalUsername = `${username}-${this.sessionPrefix}_${sessionId}`;
        }

        const proxyString = `${type}://${finalUsername}:${password}@${host}:${port}`;

        logger.debug(`Generated proxy string for session ${sessionId || 'default'}`);
        return proxyString;
    }

    getNextProxy() {
        // Rotate through sessions
        this.currentSessionIndex = (this.currentSessionIndex + 1) % this.maxSessions;
        const sessionId = this.currentSessionIndex;

        return {
            proxyString: this.getProxyString(sessionId),
            sessionId: sessionId,
            host: this.proxyConfig.host,
            port: this.proxyConfig.port,
            username: `${this.proxyConfig.username}-${this.sessionPrefix}_${sessionId}`,
            password: this.proxyConfig.password,
            type: this.proxyConfig.type
        };
    }

    getRandomProxy() {
        const randomSession = Math.floor(Math.random() * this.maxSessions);

        return {
            proxyString: this.getProxyString(randomSession),
            sessionId: randomSession,
            host: this.proxyConfig.host,
            port: this.proxyConfig.port,
            username: `${this.proxyConfig.username}-${this.sessionPrefix}_${randomSession}`,
            password: this.proxyConfig.password,
            type: this.proxyConfig.type
        };
    }

    async testProxyConnection(sessionId = null) {
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');

        try {
            logger.debug(`Testing proxy connection${sessionId ? ` for session ${sessionId}` : ''}...`);

            const proxyString = this.getProxyString(sessionId);
            const proxyAgent = new HttpsProxyAgent(proxyString);

            const startTime = Date.now();
            const response = await axios.get('https://httpbin.org/ip', {
                httpAgent: proxyAgent,
                httpsAgent: proxyAgent,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const responseTime = Date.now() - startTime;

            if (response.status === 200 && response.data.origin) {
                this.healthStats.successfulChecks++;
                this.healthStats.lastCheckStatus = 'success';

                logger.info(`✅ Proxy connection successful${sessionId ? ` (session ${sessionId})` : ''}`);
                logger.debug(`IP: ${response.data.origin}, Response time: ${responseTime}ms`);

                return {
                    success: true,
                    ip: response.data.origin,
                    responseTime: responseTime,
                    sessionId: sessionId
                };
            } else {
                throw new Error('Invalid response from proxy');
            }

        } catch (error) {
            this.healthStats.lastCheckStatus = 'failure';
            logger.error(`❌ Proxy connection failed${sessionId ? ` (session ${sessionId})` : ''}:`, error.message);

            return {
                success: false,
                error: error.message,
                sessionId: sessionId
            };
        } finally {
            this.healthStats.totalChecks++;
            this.healthStats.lastCheckTime = new Date().toISOString();
        }
    }

    async testAllSessions() {
        logger.info('🔍 Testing all proxy sessions...');

        const results = [];
        const testPromises = [];

        for (let i = 0; i < this.maxSessions; i++) {
            testPromises.push(this.testProxyConnection(i));
        }

        const sessionResults = await Promise.allSettled(testPromises);

        sessionResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push({
                    sessionId: index,
                    ...result.value
                });
            } else {
                results.push({
                    sessionId: index,
                    success: false,
                    error: result.reason.message
                });
            }
        });

        const successfulSessions = results.filter(r => r.success).length;
        const totalSessions = results.length;

        logger.info(`📊 Proxy test completed: ${successfulSessions}/${totalSessions} sessions working`);

        return results;
    }

    async getWorkingProxy() {
        logger.debug('🔍 Getting working proxy...');

        // First try the next proxy in rotation
        let proxy = this.getNextProxy();
        let testResult = await this.testProxyConnection(proxy.sessionId);

        if (testResult.success) {
            return { ...proxy, ip: testResult.ip };
        }

        // If that fails, try a few random sessions
        const maxAttempts = 5;
        let attempts = 0;

        while (attempts < maxAttempts) {
            proxy = this.getRandomProxy();
            testResult = await this.testProxyConnection(proxy.sessionId);

            if (testResult.success) {
                logger.info(`✅ Found working proxy after ${attempts + 1} attempts`);
                return { ...proxy, ip: testResult.ip };
            }

            attempts++;

            // Brief delay between attempts
            if (attempts < maxAttempts) {
                await this.delay(1000);
            }
        }

        logger.error('❌ Could not find working proxy after all attempts');
        throw new Error('No working proxy sessions available');
    }

    getProxyConfigForPuppeteer(sessionId = null) {
        const proxyString = this.getProxyString(sessionId);
        const [protocol, rest] = proxyString.split('://');
        const [auth, hostPort] = rest.split('@');
        const [username, password] = auth.split(':');
        const [host, port] = hostPort.split(':');

        return {
            server: `${protocol}://${host}:${port}`,
            username: username,
            password: password
        };
    }

    getProxyConfigForAxios(sessionId = null) {
        const [host, port] = [this.proxyConfig.host, this.proxyConfig.port];
        const username = sessionId ?
            `${this.proxyConfig.username}-${this.sessionPrefix}_${sessionId}` :
            this.proxyConfig.username;

        return {
            host: host,
            port: port,
            auth: {
                username: username,
                password: this.proxyConfig.password
            },
            protocol: this.proxyConfig.type
        };
    }

    async rotateProxy() {
        logger.debug('🔄 Rotating proxy...');

        const oldSessionId = this.currentSessionIndex;
        const newProxy = this.getNextProxy();

        logger.info(`🔄 Rotated from session ${oldSessionId} to session ${newProxy.sessionId}`);

        return newProxy;
    }

    getHealthStats() {
        const successRate = this.healthStats.totalChecks > 0 ?
            ((this.healthStats.successfulChecks / this.healthStats.totalChecks) * 100).toFixed(1) : 0;

        return {
            ...this.healthStats,
            successRate: `${successRate}%`,
            currentSession: this.currentSessionIndex
        };
    }

    async validateProxyConfiguration() {
        logger.info('🔧 Validating proxy configuration...');

        const requiredFields = ['host', 'port', 'username', 'password'];
        const missingFields = requiredFields.filter(field => !this.proxyConfig[field]);

        if (missingFields.length > 0) {
            const error = `Missing proxy configuration fields: ${missingFields.join(', ')}`;
            logger.error(error);
            throw new Error(error);
        }

        // Test basic connectivity
        const testResult = await this.testProxyConnection(0);

        if (!testResult.success) {
            const error = `Proxy configuration validation failed: ${testResult.error}`;
            logger.error(error);
            throw new Error(error);
        }

        logger.info('✅ Proxy configuration is valid and working');
        return true;
    }

    logProxyInfo() {
        logger.info('📊 Current Proxy Configuration:');
        logger.info(`   Host: ${this.proxyConfig.host}:${this.proxyConfig.port}`);
        logger.info(`   Type: ${this.proxyConfig.type}`);
        logger.info(`   Username: ${this.proxyConfig.username}*`);
        logger.info(`   Max Sessions: ${this.maxSessions}`);
        logger.info(`   Current Session: ${this.currentSessionIndex}`);

        const stats = this.getHealthStats();
        logger.info(`   Success Rate: ${stats.successRate}`);
        logger.info(`   Last Check: ${stats.lastCheckTime || 'Never'}`);
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ProxyManager;