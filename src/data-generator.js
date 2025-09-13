const logger = require('../utils/logger');

class DataGenerator {
    constructor() {
        this.usedEmails = new Set();
        this.usedUsernames = new Set();
    }

    async generateUserData() {
        logger.debug('📊 Generating user data...');

        const userData = {
            // Personal information
            firstName: this.generateFirstName(),
            lastName: this.generateLastName(),
            email: null,
            username: null,
            password: this.generatePassword(),

            // Contact information
            phoneNumber: this.generatePhoneNumber(),
            address: this.generateAddress(),

            // Personal details
            birthDate: this.generateBirthDate(),
            birthDay: null,
            birthMonth: null,
            birthYear: null,
            gender: this.generateGender(),

            // Browser fingerprinting
            userAgent: this.generateUserAgent(),
            timezone: this.generateTimezone(),
            locale: this.generateLocale(),

            // Additional metadata
            createdAt: new Date().toISOString(),
            generationId: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Generate unique email and username
        userData.email = this.generateUniqueEmail(userData.firstName, userData.lastName);
        userData.username = this.generateUniqueUsername(userData.firstName, userData.lastName);

        // Parse birth date
        const birthDate = new Date(userData.birthDate);
        userData.birthDay = birthDate.getDate();
        userData.birthMonth = birthDate.getMonth() + 1;
        userData.birthYear = birthDate.getFullYear();

        logger.debug('User data generated:', {
            name: `${userData.firstName} ${userData.lastName}`,
            email: userData.email,
            birthYear: userData.birthYear,
            timezone: userData.timezone
        });

        return userData;
    }

    generateFirstName() {
        const firstNames = [
            // Common English first names with good distribution
            'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
            'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua',
            'Kenneth', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan',
            'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
            'Lisa', 'Nancy', 'Betty', 'Helen', 'Sandra', 'Donna', 'Carol', 'Ruth', 'Sharon', 'Michelle',
            'Laura', 'Sarah', 'Kimberly', 'Deborah', 'Dorothy', 'Lisa', 'Nancy', 'Karen', 'Betty', 'Helen',
            'Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Jamie', 'Morgan', 'Avery', 'Riley', 'Peyton'
        ];

        return firstNames[Math.floor(Math.random() * firstNames.length)];
    }

    generateLastName() {
        const lastNames = [
            'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
            'Hernandez', 'Lopez', 'Gonzales', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
            'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
            'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
            'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
            'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes',
            'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper'
        ];

        return lastNames[Math.floor(Math.random() * lastNames.length)];
    }

    generateUniqueEmail(firstName, lastName) {
        const domains = [
            'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
            'protonmail.com', 'mail.com', 'gmx.com', 'yandex.com', 'aol.com'
        ];

        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            const domain = domains[Math.floor(Math.random() * domains.length)];
            const timestamp = Date.now().toString().slice(-6);
            const randomNum = Math.floor(Math.random() * 999) + 1;

            // Various email formats to make them look natural
            const formats = [
                `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}@${domain}`,
                `${firstName.toLowerCase()}${lastName.toLowerCase()}${timestamp}@${domain}`,
                `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase()}${randomNum}@${domain}`,
                `${firstName.toLowerCase()}${randomNum}@${domain}`,
                `${firstName.toLowerCase()}_${lastName.toLowerCase()}@${domain}`,
                `${firstName.toLowerCase()}.${lastName.charAt(0).toLowerCase()}${randomNum}@${domain}`
            ];

            const email = formats[Math.floor(Math.random() * formats.length)];

            if (!this.usedEmails.has(email)) {
                this.usedEmails.add(email);
                return email;
            }

            attempts++;
        }

        // Fallback if all attempts failed
        const fallbackEmail = `${firstName.toLowerCase()}${lastName.toLowerCase()}${Date.now()}@gmail.com`;
        this.usedEmails.add(fallbackEmail);
        return fallbackEmail;
    }

    generateUniqueUsername(firstName, lastName) {
        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            const randomNum = Math.floor(Math.random() * 9999) + 1;

            const formats = [
                `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomNum}`,
                `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase()}${randomNum}`,
                `${firstName.toLowerCase()}${randomNum}`,
                `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
                `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}`
            ];

            const username = formats[Math.floor(Math.random() * formats.length)];

            if (!this.usedUsernames.has(username)) {
                this.usedUsernames.add(username);
                return username;
            }

            attempts++;
        }

        // Fallback
        const fallbackUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}${Date.now()}`;
        this.usedUsernames.add(fallbackUsername);
        return fallbackUsername;
    }

    generatePassword() {
        // Generate secure password with good complexity
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

        let password = '';

        // Ensure at least one character from each category
        password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
        password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
        password += numbers.charAt(Math.floor(Math.random() * numbers.length));
        password += symbols.charAt(Math.floor(Math.random() * symbols.length));

        // Fill the rest randomly
        const allChars = lowercase + uppercase + numbers + symbols;
        const length = Math.floor(Math.random() * 4) + 8; // 8-11 characters

        for (let i = password.length; i < length; i++) {
            password += allChars.charAt(Math.floor(Math.random() * allChars.length));
        }

        // Shuffle the password
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }

    generatePhoneNumber() {
        // Generate E.164 formatted phone numbers for different countries
        const countries = [
            {
                code: '+1',
                name: 'US/Canada',
                weight: 0.7,
                generator: () => {
                    // North American Numbering Plan (NANP)
                    const areaCode = Math.floor(Math.random() * 700) + 200;
                    const exchange = Math.floor(Math.random() * 700) + 200;
                    const number = Math.floor(Math.random() * 9000) + 1000;
                    return `+1${areaCode}${exchange}${number}`;
                }
            },
            {
                code: '+44',
                name: 'UK',
                weight: 0.1,
                generator: () => {
                    // UK mobile numbers (07xxx xxxxxx format)
                    const prefix = '7';
                    const group1 = Math.floor(Math.random() * 900) + 100;
                    const group2 = Math.floor(Math.random() * 900000) + 100000;
                    return `+44${prefix}${group1}${group2}`;
                }
            },
            {
                code: '+49',
                name: 'Germany',
                weight: 0.05,
                generator: () => {
                    // German mobile numbers (01xx xxxxxxx format)
                    const prefix = '15';
                    const number = Math.floor(Math.random() * 90000000) + 10000000;
                    return `+49${prefix}${number}`;
                }
            },
            {
                code: '+33',
                name: 'France',
                weight: 0.05,
                generator: () => {
                    // French mobile numbers (06/07 xx xx xx xx format)
                    const prefix = Math.random() < 0.5 ? '6' : '7';
                    const group1 = Math.floor(Math.random() * 90) + 10;
                    const group2 = Math.floor(Math.random() * 90) + 10;
                    const group3 = Math.floor(Math.random() * 90) + 10;
                    const group4 = Math.floor(Math.random() * 90) + 10;
                    return `+33${prefix}${group1}${group2}${group3}${group4}`;
                }
            },
            {
                code: '+61',
                name: 'Australia',
                weight: 0.05,
                generator: () => {
                    // Australian mobile numbers (04xx xxx xxx format)
                    const prefix = '4';
                    const group1 = Math.floor(Math.random() * 90) + 10;
                    const group2 = Math.floor(Math.random() * 900) + 100;
                    const group3 = Math.floor(Math.random() * 900) + 100;
                    return `+61${prefix}${group1}${group2}${group3}`;
                }
            },
            {
                code: '+81',
                name: 'Japan',
                weight: 0.03,
                generator: () => {
                    // Japanese mobile numbers (090/080/070 xxxx xxxx format)
                    const prefixes = ['90', '80', '70'];
                    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
                    const group1 = Math.floor(Math.random() * 9000) + 1000;
                    const group2 = Math.floor(Math.random() * 9000) + 1000;
                    return `+81${prefix}${group1}${group2}`;
                }
            },
            {
                code: '+34',
                name: 'Spain',
                weight: 0.02,
                generator: () => {
                    // Spanish mobile numbers (6xx xxx xxx format)
                    const prefix = '6';
                    const group1 = Math.floor(Math.random() * 90) + 10;
                    const group2 = Math.floor(Math.random() * 900) + 100;
                    const group3 = Math.floor(Math.random() * 900) + 100;
                    return `+34${prefix}${group1}${group2}${group3}`;
                }
            }
        ];

        // Select country based on weights
        const random = Math.random();
        let cumulativeWeight = 0;

        for (const country of countries) {
            cumulativeWeight += country.weight;
            if (random <= cumulativeWeight) {
                return country.generator();
            }
        }

        // Fallback to US number
        return countries[0].generator();
    }

    generateAddress() {
        const streets = [
            'Main St', 'Oak Ave', 'Pine Rd', 'Maple Dr', 'Cedar Ln', 'Elm St', 'Park Ave', 'First St',
            'Second St', 'Third St', 'Fourth St', 'Fifth St', 'Washington St', 'Lincoln Ave', 'Madison Dr',
            'Jefferson Rd', 'Adams St', 'Jackson Ave', 'Wilson Dr', 'Taylor St', 'Brown Rd', 'Davis Ave'
        ];

        const cities = [
            'Springfield', 'Franklin', 'Georgetown', 'Clinton', 'Greenville', 'Salem', 'Fairview', 'Madison',
            'Washington', 'Chester', 'Marion', 'Oxford', 'Ashland', 'Burlington', 'Manchester', 'Auburn',
            'Riverside', 'Cleveland', 'Dover', 'Hudson', 'Kingston', 'Milford', 'Newport', 'Richmond'
        ];

        const states = [
            'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
            'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
            'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
            'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
            'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
        ];

        const streetNumber = Math.floor(Math.random() * 9999) + 1;
        const street = streets[Math.floor(Math.random() * streets.length)];
        const city = cities[Math.floor(Math.random() * cities.length)];
        const state = states[Math.floor(Math.random() * states.length)];
        const zipCode = Math.floor(Math.random() * 90000) + 10000;

        return {
            street: `${streetNumber} ${street}`,
            city: city,
            state: state,
            zipCode: zipCode.toString(),
            full: `${streetNumber} ${street}, ${city}, ${state} ${zipCode}`
        };
    }

    generateBirthDate() {
        // Generate birth date for adults (18-65 years old)
        const currentYear = new Date().getFullYear();
        const minAge = 18;
        const maxAge = 65;

        const birthYear = currentYear - Math.floor(Math.random() * (maxAge - minAge + 1)) - minAge;
        const birthMonth = Math.floor(Math.random() * 12) + 1;
        const daysInMonth = new Date(birthYear, birthMonth, 0).getDate();
        const birthDay = Math.floor(Math.random() * daysInMonth) + 1;

        return new Date(birthYear, birthMonth - 1, birthDay).toISOString().split('T')[0];
    }

    generateGender() {
        const genders = ['1', '2', '3']; // 1=Male, 2=Female, 3=Prefer not to say
        const weights = [0.45, 0.45, 0.10]; // Distribution weights

        const random = Math.random();
        let cumulativeWeight = 0;

        for (let i = 0; i < genders.length; i++) {
            cumulativeWeight += weights[i];
            if (random <= cumulativeWeight) {
                return genders[i];
            }
        }

        return '3'; // Default to "Prefer not to say"
    }

    generateUserAgent() {
        const userAgents = [
            // Windows Chrome
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',

            // macOS Chrome
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',

            // Windows Edge
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',

            // macOS Safari
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
        ];

        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    generateTimezone() {
        const timezones = [
            'America/New_York',      // EST/EDT
            'America/Chicago',       // CST/CDT
            'America/Denver',        // MST/MDT
            'America/Los_Angeles',   // PST/PDT
            'America/Phoenix',       // MST (no DST)
            'America/Anchorage',     // AKST/AKDT
            'Pacific/Honolulu',      // HST
            'Europe/London',         // GMT/BST
            'Europe/Berlin',         // CET/CEST
            'Europe/Paris',          // CET/CEST
            'Asia/Tokyo',            // JST
            'Australia/Sydney'       // AEST/AEDT
        ];

        return timezones[Math.floor(Math.random() * timezones.length)];
    }

    generateLocale() {
        const locales = [
            'en-US',    // United States English
            'en-GB',    // British English
            'en-CA',    // Canadian English
            'en-AU',    // Australian English
            'de-DE',    // German (Germany)
            'fr-FR',    // French (France)
            'es-ES',    // Spanish (Spain)
            'it-IT',    // Italian (Italy)
            'pt-BR',    // Portuguese (Brazil)
            'ja-JP',    // Japanese (Japan)
            'ko-KR',    // Korean (South Korea)
            'zh-CN'     // Chinese (China)
        ];

        // Bias towards English locales for better compatibility
        const weights = [0.4, 0.15, 0.1, 0.1, 0.05, 0.05, 0.05, 0.03, 0.03, 0.02, 0.01, 0.01];

        const random = Math.random();
        let cumulativeWeight = 0;

        for (let i = 0; i < locales.length; i++) {
            cumulativeWeight += weights[i];
            if (random <= cumulativeWeight) {
                return locales[i];
            }
        }

        return 'en-US'; // Default
    }

    generateCompanyName() {
        const adjectives = [
            'Global', 'Digital', 'Tech', 'Advanced', 'Smart', 'Modern', 'Creative', 'Innovative',
            'Dynamic', 'Strategic', 'Premier', 'Elite', 'Professional', 'Integrated', 'Next'
        ];

        const nouns = [
            'Solutions', 'Systems', 'Technologies', 'Services', 'Consulting', 'Enterprises',
            'Innovations', 'Dynamics', 'Networks', 'Partners', 'Group', 'Corp', 'Inc', 'LLC'
        ];

        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        return `${adjective} ${noun}`;
    }

    generateWebsite() {
        const domains = [
            'example.com', 'test-site.com', 'demo-company.net', 'sample-business.org',
            'placeholder-site.com', 'temp-domain.net', 'demo-website.com', 'test-company.biz'
        ];

        return `https://www.${domains[Math.floor(Math.random() * domains.length)]}`;
    }

    validateUserData(userData) {
        const requiredFields = [
            'firstName', 'lastName', 'email', 'password', 'birthDay', 'birthMonth', 'birthYear'
        ];

        const missing = requiredFields.filter(field => !userData[field]);

        if (missing.length > 0) {
            throw new Error(`Missing required user data fields: ${missing.join(', ')}`);
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
            throw new Error('Invalid email format');
        }

        // Validate password strength
        if (userData.password.length < 8) {
            throw new Error('Password too short (minimum 8 characters)');
        }

        // Validate birth date
        const birthDate = new Date(userData.birthYear, userData.birthMonth - 1, userData.birthDay);
        const age = (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

        if (age < 18 || age > 100) {
            throw new Error('Invalid age (must be 18-100 years old)');
        }

        return true;
    }

    clearCache() {
        this.usedEmails.clear();
        this.usedUsernames.clear();
        logger.debug('Data generator cache cleared');
    }

    getStats() {
        return {
            usedEmails: this.usedEmails.size,
            usedUsernames: this.usedUsernames.size
        };
    }
}

module.exports = DataGenerator;