#!/usr/bin/env node
/**
 * Debug Google account creation with visible browser
 */

const StealthBrowser = require('./src/stealth-browser');
const GoogleAccount = require('./src/google-account');
const DataGenerator = require('./src/data-generator');
const logger = require('./utils/logger');

async function debugGoogle() {
    console.log('🔍 Starting Google account creation debug...');

    const stealthBrowser = new StealthBrowser();

    try {
        // Generate test user data
        const dataGenerator = new DataGenerator();
        const userData = dataGenerator.generateUserData();

        // Add fallback data if generation failed
        if (!userData.firstName) {
            const timestamp = Date.now().toString().slice(-6);
            const randomNum = Math.floor(Math.random() * 999) + 1;
            userData.firstName = 'TestUser';
            userData.lastName = 'TestLastName';
            userData.birthMonth = 5; // May
            userData.birthDay = 15;
            userData.birthYear = 1990;
            userData.gender = 3; // Prefer not to say
            userData.email = `testuser${timestamp}${randomNum}@gmail.com`;
            userData.password = 'TestPass123!';
            userData.username = `testuser${timestamp}${randomNum}`;
            userData.phoneNumber = `+1234567890${randomNum}`; // Add fallback phone number
        }
        console.log('📊 Generated user data:', {
            firstName: userData.firstName,
            lastName: userData.lastName,
            birthMonth: userData.birthMonth,
            birthDay: userData.birthDay,
            birthYear: userData.birthYear,
            gender: userData.gender
        });

        // Launch browser with visible mode
        const browser = await stealthBrowser.launch(null, {
            headless: false, // Force visible browser
            proxy: {
                host: process.env.PROXY_HOST,
                port: process.env.PROXY_PORT,
                username: process.env.PROXY_USERNAME,
                password: process.env.PROXY_PASSWORD,
                type: process.env.PROXY_TYPE || 'http'
            }
        });

        console.log('✅ Browser launched in visible mode');

        // Create Google account with debug mode (keeps browser open on errors)
        const googleAccount = new GoogleAccount();
        const accountInfo = await googleAccount.create(browser, userData, { debugMode: true });

        console.log('✅ Google account created:', accountInfo);

    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

if (require.main === module) {
    debugGoogle().catch(console.error);
}