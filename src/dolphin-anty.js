const axios = require('axios');
const logger = require('../utils/logger');
const settings = require('../config/settings');

class DolphinAnty {
    constructor() {
        this.host = process.env.DOLPHIN_ANTY_HOST || 'http://localhost:3001';
        this.token = process.env.DOLPHIN_ANTY_TOKEN;

        if (!this.token) {
            logger.warn('⚠️  DOLPHIN_ANTY_TOKEN not set. Some features may not work properly.');
        }

        // Support for different API versions and auth header formats
        this.apiVersion = process.env.DOLPHIN_ANTY_API_VERSION || 'auto';
        this.authHeaderType = process.env.DOLPHIN_ANTY_AUTH_HEADER_TYPE || 'auto';

        this.client = axios.create({
            baseURL: this.host,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Set authentication header based on configuration or auto-detection
        this.setAuthHeader();

        // Add request/response interceptors for logging
        this.client.interceptors.request.use(
            (config) => {
                logger.debug(`Dolphin Anty API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error('Dolphin Anty API Request Error:', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                logger.debug(`Dolphin Anty API Response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                logger.error('Dolphin Anty API Response Error:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    data: error.response?.data
                });
                return Promise.reject(error);
            }
        );
    }

    setAuthHeader() {
        if (!this.token) return;

        const common = this.client.defaults.headers.common || (this.client.defaults.headers.common = {});

        if (this.authHeaderType === 'bearer') {
            common['Authorization'] = `Bearer ${this.token}`;
        } else if (this.authHeaderType === 'x-auth-token') {
            common['X-Auth-Token'] = this.token;
        } else {
            // Auto mode - start with newer X-Auth-Token format
            common['X-Auth-Token'] = this.token; // auto default
        }
    }

    async testConnection() {
        try {
            logger.debug('Testing Dolphin Anty connection...');

            // Try current configuration first
            let response = await this.attemptConnection();

            if (response) {
                logger.info('✅ Dolphin Anty connection successful');
                return {
                    success: true,
                    apiVersion: this.detectedApiVersion,
                    authHeaderType: this.detectedAuthHeaderType
                };
            }

            throw new Error('All connection attempts failed');

        } catch (error) {
            logger.error('❌ Failed to connect to Dolphin Anty:', error.message);
            throw new Error(`Dolphin Anty connection failed: ${error.message}`);
        }
    }

    async attemptConnection() {
        // If auto mode, try different combinations
        if (this.authHeaderType === 'auto' || this.apiVersion === 'auto') {
            const authTypes = ['x-auth-token', 'bearer'];
            const apiVersions = ['/v1.0/', '/v2/'];

            for (const authType of authTypes) {
                for (const apiVer of apiVersions) {
                    try {
                        // Update headers for this attempt
                        const headers = { 'Content-Type': 'application/json' };
                        if (authType === 'bearer') {
                            headers['Authorization'] = `Bearer ${this.token}`;
                        } else {
                            headers['X-Auth-Token'] = this.token;
                        }

                        const testClient = axios.create({
                            baseURL: this.host,
                            timeout: 10000,
                            headers
                        });

                        const endpoint = apiVer + 'browser_profiles';
                        const response = await testClient.get(endpoint);

                        // Success! Update configuration
                        this.detectedApiVersion = apiVer;
                        this.detectedAuthHeaderType = authType;
                        const common = this.client.defaults.headers.common || (this.client.defaults.headers.common = {});
                        Object.assign(common, headers);

                        logger.info(`✅ Connection successful with API version ${apiVer} and auth type ${authType}`);
                        return response;

                    } catch (error) {
                        logger.debug(`Failed attempt: ${authType} + ${apiVer} - ${error.message}`);
                        continue;
                    }
                }
            }

            return null;
        } else {
            // Use configured settings
            const endpoint = this.apiVersion === 'v2' ? '/v2/browser_profiles' : '/v1.0/browser_profiles';
            return await this.client.get(endpoint);
        }
    }

    async createProfile(options = {}) {
        const { name, userData, proxy } = options;

        try {
            // Pre-flight validation
            const connectionTest = await this.testConnection();
            if (!connectionTest.success) {
                throw new Error('API connectivity test failed before profile creation');
            }

            logger.debug(`Creating Dolphin Anty profile: ${name}`);

            // Generate random fingerprint data
            const fingerprint = this.generateFingerprint(userData);

            const profileData = {
                name: name || `profile_${Date.now()}`,
                notes: `Auto-created for Kilocode automation - ${new Date().toISOString()}`,

                // Browser settings
                browser: {
                    browserType: 'anty',
                    version: this.getRandomBrowserVersion(),
                    userAgent: fingerprint.userAgent
                },

                // Proxy settings
                ...(proxy && {
                    proxy: {
                        type: proxy.type || 'http',
                        host: proxy.host,
                        port: proxy.port,
                        username: proxy.username,
                        password: proxy.password
                    }
                }),

                // Fingerprint settings
                fingerprint: {
                    screen: fingerprint.screen,
                    webgl: fingerprint.webgl,
                    canvas: fingerprint.canvas,
                    fonts: fingerprint.fonts,
                    plugins: fingerprint.plugins,
                    timezone: fingerprint.timezone,
                    locale: fingerprint.locale,
                    cpu: fingerprint.cpu,
                    memory: fingerprint.memory
                },

                // Security settings
                storage: {
                    local: true,
                    extensions: false,
                    bookmarks: false,
                    history: false,
                    passwords: false
                },

                // Automation-friendly settings
                automation: {
                    allowAutomation: true,
                    disableWebSecurity: false,
                    disableFeatures: ['VizDisplayCompositor']
                }
            };

            // Use detected or configured API version
            const base = this.detectedApiVersion || (this.apiVersion === 'v2' ? '/v2/' : '/v1.0/');
            const apiEndpoint = `${base}browser_profiles`;

            const response = await this.client.post(apiEndpoint, profileData);
            const profileId = response.data.browserProfileId || response.data.id;

            if (!profileId) {
                throw new Error('Profile creation successful but no profile ID returned');
            }

            logger.info(`✅ Profile created successfully: ${profileId}`);
            return profileId;

        } catch (error) {
            logger.error('❌ Failed to create Dolphin Anty profile:', error.message);

            if (error.response?.status === 401) {
                // Try alternative authentication method
                if (this.authHeaderType === 'auto') {
                    logger.debug('401 error - attempting authentication fallback');
                    try {
                        const fallbackAuthType = this.detectedAuthHeaderType === 'bearer' ? 'x-auth-token' : 'bearer';
                        const headers = { 'Content-Type': 'application/json' };

                        if (fallbackAuthType === 'bearer') {
                            headers['Authorization'] = `Bearer ${this.token}`;
                        } else {
                            headers['X-Auth-Token'] = this.token;
                        }

                        // Use safe header merging to avoid overwriting defaults
                        const common = this.client.defaults.headers.common || (this.client.defaults.headers.common = {});
                        Object.assign(common, headers);
                        logger.debug(`Retrying with ${fallbackAuthType} authentication`);

                        // Retry the request
                        const base = this.detectedApiVersion || (this.apiVersion === 'v2' ? '/v2/' : '/v1.0/');
                        const apiEndpoint = `${base}browser_profiles`;
                        const retryResponse = await this.client.post(apiEndpoint, profileData);
                        const retryProfileId = retryResponse.data.browserProfileId || retryResponse.data.id;

                        logger.info(`✅ Profile created successfully with fallback auth: ${retryProfileId}`);
                        return retryProfileId;

                    } catch (fallbackError) {
                        logger.error('Authentication fallback also failed:', fallbackError.message);
                    }
                }
                throw new Error('Dolphin Anty authentication failed. Check your API token and try updating DOLPHIN_ANTY_AUTH_HEADER_TYPE.');
            } else if (error.response?.status === 429) {
                throw new Error('Rate limited by Dolphin Anty. Please wait before retrying.');
            } else if (error.response?.status === 404 && this.apiVersion === 'auto') {
                throw new Error('API endpoint not found. The Dolphin Anty version may have changed. Try setting DOLPHIN_ANTY_API_VERSION.');
            } else if (error.response?.data?.message) {
                throw new Error(`Dolphin Anty API error: ${error.response.data.message}`);
            }

            throw new Error(`Failed to create profile: ${error.message}`);
        }
    }

    async updateProfile(profileId, updates) {
        try {
            logger.debug(`Updating profile ${profileId}`);

            const base = this.detectedApiVersion || (this.apiVersion === 'v2' ? '/v2/' : '/v1.0/');
            const apiEndpoint = `${base}browser_profiles/${profileId}`;

            const response = await this.client.patch(apiEndpoint, updates);

            logger.debug(`Profile ${profileId} updated successfully`);
            return response.data;

        } catch (error) {
            logger.error(`Failed to update profile ${profileId}:`, error.message);
            throw new Error(`Failed to update profile: ${error.message}`);
        }
    }

    async startProfile(profileId) {
        try {
            logger.debug(`Starting profile ${profileId}...`);

            const base = this.detectedApiVersion || (this.apiVersion === 'v2' ? '/v2/' : '/v1.0/');
            const apiEndpoint = `${base}browser_profiles/${profileId}/start`;

            const response = await this.client.get(apiEndpoint);

            if (!response.data || !response.data.automation) {
                throw new Error('Profile started but no automation endpoint returned');
            }

            const { webSocketDebuggerUrl, automation } = response.data;

            logger.info(`✅ Profile ${profileId} started successfully`);
            logger.debug(`WebSocket URL: ${webSocketDebuggerUrl}`);
            logger.debug(`Automation port: ${automation.port}`);

            return {
                profileId,
                wsEndpoint: webSocketDebuggerUrl,
                port: automation.port,
                automation
            };

        } catch (error) {
            logger.error(`❌ Failed to start profile ${profileId}:`, error.message);
            throw new Error(`Failed to start profile: ${error.message}`);
        }
    }

    async stopProfile(profileId) {
        try {
            logger.debug(`Stopping profile ${profileId}...`);

            const base = this.detectedApiVersion || (this.apiVersion === 'v2' ? '/v2/' : '/v1.0/');
            const apiEndpoint = `${base}browser_profiles/${profileId}/stop`;

            await this.client.get(apiEndpoint);

            logger.debug(`✅ Profile ${profileId} stopped successfully`);

        } catch (error) {
            logger.error(`Failed to stop profile ${profileId}:`, error.message);
            // Don't throw error for stop failures as it's not critical
        }
    }

    async deleteProfile(profileId) {
        try {
            logger.debug(`Deleting profile ${profileId}...`);

            // First ensure profile is stopped
            await this.stopProfile(profileId);

            // Add small delay to ensure profile is fully stopped
            await this.delay(1000);

            // Delete the profile
            const base = this.detectedApiVersion || (this.apiVersion === 'v2' ? '/v2/' : '/v1.0/');
            const apiEndpoint = `${base}browser_profiles/${profileId}`;

            await this.client.delete(apiEndpoint);

            logger.debug(`✅ Profile ${profileId} deleted successfully`);

        } catch (error) {
            logger.error(`Failed to delete profile ${profileId}:`, error.message);
            // Don't throw error for deletion failures in cleanup
        }
    }

    async listProfiles() {
        try {
            const base = this.detectedApiVersion || (this.apiVersion === 'v2' ? '/v2/' : '/v1.0/');
            const apiEndpoint = `${base}browser_profiles`;

            const response = await this.client.get(apiEndpoint);
            return response.data.data || response.data || [];
        } catch (error) {
            logger.error('Failed to list profiles:', error.message);
            throw new Error(`Failed to list profiles: ${error.message}`);
        }
    }

    generateFingerprint(userData = {}) {
        const fingerprints = {
            userAgent: this.getRandomUserAgent(),
            screen: this.getRandomScreen(),
            webgl: this.getRandomWebGL(),
            canvas: this.getRandomCanvas(),
            fonts: this.getRandomFonts(),
            plugins: this.getRandomPlugins(),
            timezone: userData.timezone || this.getRandomTimezone(),
            locale: userData.locale || this.getRandomLocale(),
            cpu: this.getRandomCPU(),
            memory: this.getRandomMemory()
        };

        logger.debug('Generated fingerprint:', {
            userAgent: fingerprints.userAgent,
            screen: fingerprints.screen,
            timezone: fingerprints.timezone,
            locale: fingerprints.locale
        });

        return fingerprints;
    }

    getRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    getRandomScreen() {
        const screens = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
            { width: 1280, height: 720 }
        ];
        return screens[Math.floor(Math.random() * screens.length)];
    }

    getRandomWebGL() {
        const webgls = [
            { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
            { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)' }
        ];
        return webgls[Math.floor(Math.random() * webgls.length)];
    }

    getRandomCanvas() {
        return {
            noise: Math.random() > 0.5,
            shift: Math.floor(Math.random() * 10) + 1
        };
    }

    getRandomFonts() {
        const baseFonts = [
            'Arial', 'Calibri', 'Cambria', 'Georgia', 'Helvetica', 'Times New Roman',
            'Trebuchet MS', 'Verdana', 'Comic Sans MS', 'Impact'
        ];

        const additionalFonts = [
            'Segoe UI', 'Tahoma', 'Courier New', 'Lucida Console',
            'Arial Black', 'Palatino Linotype', 'Book Antiqua'
        ];

        const selectedCount = Math.floor(Math.random() * 5) + baseFonts.length;
        const allFonts = [...baseFonts, ...additionalFonts];
        return allFonts.slice(0, selectedCount);
    }

    getRandomPlugins() {
        const plugins = [
            'PDF Viewer',
            'Chrome PDF Viewer',
            'Chromium PDF Viewer',
            'Microsoft Edge PDF Viewer',
            'WebKit built-in PDF'
        ];

        const selectedCount = Math.floor(Math.random() * 3) + 1;
        return plugins.slice(0, selectedCount);
    }

    getRandomTimezone() {
        const timezones = [
            'America/New_York',
            'America/Los_Angeles',
            'America/Chicago',
            'Europe/London',
            'Europe/Berlin',
            'Europe/Paris',
            'Asia/Tokyo',
            'Australia/Sydney'
        ];
        return timezones[Math.floor(Math.random() * timezones.length)];
    }

    getRandomLocale() {
        const locales = [
            'en-US',
            'en-GB',
            'de-DE',
            'fr-FR',
            'es-ES',
            'it-IT'
        ];
        return locales[Math.floor(Math.random() * locales.length)];
    }

    getRandomCPU() {
        const cpus = [4, 6, 8, 12, 16];
        return cpus[Math.floor(Math.random() * cpus.length)];
    }

    getRandomMemory() {
        const memories = [4, 8, 16, 32];
        return memories[Math.floor(Math.random() * memories.length)];
    }

    getRandomBrowserVersion() {
        const versions = [
            '120.0.6099.109',
            '119.0.6045.199',
            '118.0.5993.117',
            '117.0.5938.149'
        ];
        return versions[Math.floor(Math.random() * versions.length)];
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async cleanup() {
        try {
            logger.debug('Cleaning up Dolphin Anty profiles...');
            const profiles = await this.listProfiles();

            const automationProfiles = profiles.filter(profile =>
                profile.name && profile.name.includes('kilocode_')
            );

            for (const profile of automationProfiles) {
                try {
                    await this.deleteProfile(profile.id);
                    logger.debug(`Cleaned up profile: ${profile.name}`);
                } catch (error) {
                    logger.warn(`Failed to cleanup profile ${profile.name}:`, error.message);
                }
            }

            logger.info(`✅ Cleaned up ${automationProfiles.length} automation profiles`);

        } catch (error) {
            logger.error('Failed to cleanup profiles:', error.message);
        }
    }
}

module.exports = DolphinAnty;