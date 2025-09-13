#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const { createReadStream, createWriteStream } = require('fs');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline');
const zlib = require('zlib');

const DolphinAnty = require('../src/dolphin-anty');
const logger = require('../utils/logger');

class SystemCleaner {
    constructor() {
        this.dolphinAnty = new DolphinAnty();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.stats = {
            profilesDeleted: 0,
            logFilesRotated: 0,
            tempFilesDeleted: 0,
            totalSpaceFreed: 0,
            errors: []
        };
    }

    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim().toLowerCase());
            });
        });
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
                this.stats.errors.push(message);
                break;
            case 'warning':
                console.log(chalk.yellow(`${prefix} ⚠️  ${message}`));
                break;
            case 'info':
            default:
                console.log(chalk.blue(`${prefix} ℹ  ${message}`));
        }
    }

    async runCleanup(options = {}) {
        console.log(chalk.cyan('🧹 System Cleanup Tool'));
        console.log(chalk.yellow('=' .repeat(30)));
        console.log('This tool will help clean up automation artifacts and free disk space.\n');

        try {
            // Get user confirmation for destructive operations
            if (!options.force && !options.dryRun) {
                await this.getCleanupConfirmation();
            }

            // Perform cleanup operations
            if (options.profiles !== false) {
                await this.cleanupDolphinAntyProfiles(options);
            }

            if (options.logs !== false) {
                await this.cleanupLogFiles(options);
            }

            if (options.temp !== false) {
                await this.cleanupTempFiles(options);
            }

            if (options.screenshots !== false) {
                await this.cleanupScreenshots(options);
            }

            if (options.reset) {
                await this.resetErrorCounters();
            }

            // Show cleanup summary
            this.showCleanupSummary();

        } catch (error) {
            this.log(`Cleanup failed: ${error.message}`, 'error');
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    async getCleanupConfirmation() {
        console.log(chalk.yellow('⚠️  Warning: This will perform the following actions:'));
        console.log('  - Delete old Dolphin Anty profiles (test_*, temp_*)');
        console.log('  - Rotate and compress old log files');
        console.log('  - Clear temporary files and screenshots');
        console.log('  - Reset error statistics\n');

        const proceed = await this.prompt('Do you want to continue? (y/n): ');
        if (proceed !== 'y' && proceed !== 'yes') {
            console.log('Cleanup cancelled.');
            process.exit(0);
        }
    }

    async cleanupDolphinAntyProfiles(options = {}) {
        this.log('Cleaning up Dolphin Anty profiles...');

        try {
            if (process.env.DOLPHIN_ANTY_TOKEN && process.env.DOLPHIN_ANTY_TOKEN !== 'your_dolphin_anty_token_here') {
                const profiles = await this.dolphinAnty.getProfiles();

                // Filter test profiles (profiles with names starting with test_, temp_, or containing 'test')
                const testProfiles = profiles.filter(profile => {
                    const name = profile.name.toLowerCase();
                    return name.startsWith('test_') ||
                           name.startsWith('temp_') ||
                           name.includes('test') ||
                           name.includes('integration') ||
                           name.includes('cleanup');
                });

                this.log(`Found ${testProfiles.length} test profiles to clean up`);

                if (testProfiles.length === 0) {
                    this.log('No test profiles found to clean up', 'info');
                    return;
                }

                // Show profiles that will be deleted
                if (!options.quiet) {
                    console.log(chalk.yellow('\nProfiles to be deleted:'));
                    testProfiles.forEach((profile, index) => {
                        const age = this.getProfileAge(profile);
                        console.log(`  ${index + 1}. ${profile.name} (${age})`);
                    });
                }

                // Confirm deletion unless force mode
                if (!options.force && !options.dryRun) {
                    const confirm = await this.prompt(`\nDelete ${testProfiles.length} test profiles? (y/n): `);
                    if (confirm !== 'y' && confirm !== 'yes') {
                        this.log('Profile cleanup skipped', 'info');
                        return;
                    }
                }

                // Delete profiles
                for (const profile of testProfiles) {
                    try {
                        if (!options.dryRun) {
                            await this.dolphinAnty.deleteProfile(profile.id);
                            this.stats.profilesDeleted++;
                        }
                        this.log(`${options.dryRun ? '[DRY RUN] Would delete' : 'Deleted'} profile: ${profile.name}`, 'success');
                    } catch (deleteError) {
                        this.log(`Failed to delete profile ${profile.name}: ${deleteError.message}`, 'error');
                    }
                }

            } else {
                this.log('Dolphin Anty not configured, skipping profile cleanup', 'warning');
            }

        } catch (error) {
            this.log(`Profile cleanup failed: ${error.message}`, 'error');
        }
    }

    async cleanupLogFiles(options = {}) {
        this.log('Cleaning up log files...');

        try {
            const logsDir = 'logs';

            if (!fs.existsSync(logsDir)) {
                this.log('Logs directory not found, skipping', 'info');
                return;
            }

            const files = fs.readdirSync(logsDir);
            const logFiles = files.filter(f => f.endsWith('.log'));
            const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS) || 30;
            const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
            const cutoffDate = new Date(Date.now() - retentionMs);

            this.log(`Checking ${logFiles.length} log files (retention: ${retentionDays} days)`);

            let oldFiles = [];
            let largeFiles = [];
            let totalSize = 0;

            for (const file of logFiles) {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;

                // Check if file is old
                if (stats.mtime < cutoffDate) {
                    oldFiles.push({ file, path: filePath, size: stats.size, mtime: stats.mtime });
                }

                // Check if file is large (> 10MB)
                if (stats.size > 10 * 1024 * 1024) {
                    largeFiles.push({ file, path: filePath, size: stats.size });
                }
            }

            // Handle old files
            if (oldFiles.length > 0) {
                this.log(`Found ${oldFiles.length} old log files to remove`);

                if (!options.quiet) {
                    console.log(chalk.yellow('\nOld files to be deleted:'));
                    oldFiles.forEach((fileInfo, index) => {
                        const sizeMB = Math.round(fileInfo.size / 1024 / 1024);
                        const age = Math.round((Date.now() - fileInfo.mtime.getTime()) / (24 * 60 * 60 * 1000));
                        console.log(`  ${index + 1}. ${fileInfo.file} (${sizeMB}MB, ${age} days old)`);
                    });
                }

                for (const fileInfo of oldFiles) {
                    try {
                        if (!options.dryRun) {
                            fs.unlinkSync(fileInfo.path);
                            this.stats.totalSpaceFreed += fileInfo.size;
                            this.stats.logFilesRotated++;
                        }
                        this.log(`${options.dryRun ? '[DRY RUN] Would delete' : 'Deleted'} old log: ${fileInfo.file}`, 'success');
                    } catch (deleteError) {
                        this.log(`Failed to delete log ${fileInfo.file}: ${deleteError.message}`, 'error');
                    }
                }
            }

            // Handle large files (compress instead of delete)
            if (largeFiles.length > 0) {
                this.log(`Found ${largeFiles.length} large log files`);

                for (const fileInfo of largeFiles) {
                    try {
                        if (!options.dryRun) {
                            await this.compressLogFile(fileInfo.path);
                        }
                        this.log(`${options.dryRun ? '[DRY RUN] Would compress' : 'Compressed'} large log: ${fileInfo.file}`, 'success');
                    } catch (compressError) {
                        this.log(`Failed to compress log ${fileInfo.file}: ${compressError.message}`, 'error');
                    }
                }
            }

            const totalSizeMB = Math.round(totalSize / 1024 / 1024);
            this.log(`Log cleanup complete (${totalSizeMB}MB total)`, 'success');

        } catch (error) {
            this.log(`Log cleanup failed: ${error.message}`, 'error');
        }
    }

    async cleanupTempFiles(options = {}) {
        this.log('Cleaning up temporary files...');

        try {
            const tempDirs = ['temp/profiles', 'temp'];
            let totalFiles = 0;
            let totalSize = 0;

            for (const tempDir of tempDirs) {
                if (!fs.existsSync(tempDir)) {
                    continue;
                }

                const files = fs.readdirSync(tempDir);

                for (const file of files) {
                    const filePath = path.join(tempDir, file);

                    try {
                        const stats = fs.statSync(filePath);

                        if (stats.isFile()) {
                            totalSize += stats.size;

                            if (!options.dryRun) {
                                fs.unlinkSync(filePath);
                            }
                            totalFiles++;
                            this.stats.tempFilesDeleted++;
                            this.stats.totalSpaceFreed += stats.size;
                        } else if (stats.isDirectory() && tempDir === 'temp/profiles') {
                            // Clean up profile directories
                            if (!options.dryRun) {
                                fs.rmSync(filePath, { recursive: true, force: true });
                            }
                            this.log(`${options.dryRun ? '[DRY RUN] Would delete' : 'Deleted'} profile directory: ${file}`, 'info');
                        }
                    } catch (fileError) {
                        this.log(`Error processing ${filePath}: ${fileError.message}`, 'error');
                    }
                }
            }

            const sizeMB = Math.round(totalSize / 1024 / 1024);
            this.log(`Temp cleanup complete (${totalFiles} files, ${sizeMB}MB)`, 'success');

        } catch (error) {
            this.log(`Temp cleanup failed: ${error.message}`, 'error');
        }
    }

    async cleanupScreenshots(options = {}) {
        this.log('Cleaning up screenshots...');

        try {
            const screenshotsDir = 'temp/screenshots';

            if (!fs.existsSync(screenshotsDir)) {
                this.log('Screenshots directory not found, skipping', 'info');
                return;
            }

            const files = fs.readdirSync(screenshotsDir);
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|bmp)$/i.test(f));

            // Keep only recent screenshots (last 7 days)
            const retentionMs = 7 * 24 * 60 * 60 * 1000;
            const cutoffDate = new Date(Date.now() - retentionMs);

            let deletedCount = 0;
            let totalSize = 0;

            for (const file of imageFiles) {
                const filePath = path.join(screenshotsDir, file);

                try {
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;

                    if (stats.mtime < cutoffDate) {
                        if (!options.dryRun) {
                            fs.unlinkSync(filePath);
                            this.stats.totalSpaceFreed += stats.size;
                        }
                        deletedCount++;
                        this.log(`${options.dryRun ? '[DRY RUN] Would delete' : 'Deleted'} old screenshot: ${file}`, 'info');
                    }
                } catch (fileError) {
                    this.log(`Error processing screenshot ${file}: ${fileError.message}`, 'error');
                }
            }

            const sizeMB = Math.round(totalSize / 1024 / 1024);
            this.log(`Screenshot cleanup complete (${deletedCount}/${imageFiles.length} deleted, ${sizeMB}MB total)`, 'success');

        } catch (error) {
            this.log(`Screenshot cleanup failed: ${error.message}`, 'error');
        }
    }

    async resetErrorCounters() {
        this.log('Resetting error counters...');

        try {
            // This would reset any error tracking statistics
            // For now, just log the action
            this.log('Error counters reset (not yet implemented)', 'info');

        } catch (error) {
            this.log(`Error counter reset failed: ${error.message}`, 'error');
        }
    }

    async compressLogFile(filePath) {
        try {
            if (filePath.endsWith('.gz')) {
                this.log(`Skipping already compressed file: ${path.basename(filePath)}`, 'info');
                return;
            }

            const gzPath = `${filePath}.gz`;
            const originalStats = fs.statSync(filePath);

            await new Promise((resolve, reject) => {
                const input = createReadStream(filePath);
                const output = createWriteStream(gzPath);
                const gzip = zlib.createGzip();

                input.pipe(gzip).pipe(output)
                    .on('finish', resolve)
                    .on('error', reject);
            });

            const gzStats = fs.statSync(gzPath);

            // Delete original after successful compression
            fs.unlinkSync(filePath);

            // Update stats
            this.stats.logFilesRotated++;
            const saved = Math.max(0, originalStats.size - gzStats.size);
            this.stats.totalSpaceFreed += saved;

        } catch (error) {
            throw new Error(`Compression failed for ${filePath}: ${error.message}`);
        }
    }

    getProfileAge(profile) {
        // Estimate profile age based on name or creation pattern
        if (profile.name.includes('_')) {
            const parts = profile.name.split('_');
            const timestamp = parts[parts.length - 1];

            if (/^\d{13}$/.test(timestamp)) {
                const date = new Date(parseInt(timestamp));
                const age = Math.round((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
                return `${age} days old`;
            }
        }

        return 'unknown age';
    }

    showCleanupSummary() {
        console.log('\n' + '='.repeat(40));
        console.log(chalk.cyan('🧹 Cleanup Summary'));
        console.log('='.repeat(40));

        console.log(chalk.green(`✅ Profiles deleted: ${this.stats.profilesDeleted}`));
        console.log(chalk.green(`✅ Log files rotated: ${this.stats.logFilesRotated}`));
        console.log(chalk.green(`✅ Temp files deleted: ${this.stats.tempFilesDeleted}`));

        const spaceMB = Math.round(this.stats.totalSpaceFreed / 1024 / 1024);
        console.log(chalk.green(`✅ Space freed: ${spaceMB}MB`));

        if (this.stats.errors.length > 0) {
            console.log(chalk.red(`❌ Errors: ${this.stats.errors.length}`));
            this.stats.errors.forEach(error => {
                console.log(chalk.red(`  - ${error}`));
            });
        } else {
            console.log(chalk.green('✅ No errors occurred'));
        }

        console.log('\n' + '='.repeat(40));

        if (this.stats.errors.length === 0) {
            console.log(chalk.green('🎉 Cleanup completed successfully!'));
        } else {
            console.log(chalk.yellow('⚠️  Cleanup completed with some errors'));
        }
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const helpFlag = args.includes('--help') || args.includes('-h');

    const options = {
        force: args.includes('--force') || args.includes('-f'),
        dryRun: args.includes('--dry-run') || args.includes('--dry'),
        quiet: args.includes('--quiet') || args.includes('-q'),
        profiles: !args.includes('--no-profiles'),
        logs: !args.includes('--no-logs'),
        temp: !args.includes('--no-temp'),
        screenshots: !args.includes('--no-screenshots'),
        reset: args.includes('--reset')
    };

    if (helpFlag) {
        console.log(chalk.cyan('System Cleanup Tool'));
        console.log('\nUsage: node scripts/cleanup.js [options]');
        console.log('\nOptions:');
        console.log('  --help, -h         Show this help message');
        console.log('  --force, -f        Skip confirmation prompts');
        console.log('  --dry-run, --dry   Show what would be deleted without doing it');
        console.log('  --quiet, -q        Minimal output');
        console.log('  --no-profiles      Skip Dolphin Anty profile cleanup');
        console.log('  --no-logs          Skip log file cleanup');
        console.log('  --no-temp          Skip temp file cleanup');
        console.log('  --no-screenshots   Skip screenshot cleanup');
        console.log('  --reset            Reset error counters');
        console.log('\nCleanup Operations:');
        console.log('  - Delete test Dolphin Anty profiles (test_*, temp_*, *test*)');
        console.log('  - Rotate old log files (older than LOG_RETENTION_DAYS)');
        console.log('  - Compress large log files (> 10MB)');
        console.log('  - Clear temporary browser profiles');
        console.log('  - Delete old screenshots (older than 7 days)');
        console.log('  - Reset automation error statistics');
        console.log('\nExamples:');
        console.log('  node scripts/cleanup.js                    # Interactive cleanup');
        console.log('  node scripts/cleanup.js --dry-run          # Preview what would be cleaned');
        console.log('  node scripts/cleanup.js --force            # Cleanup without prompts');
        console.log('  node scripts/cleanup.js --no-profiles      # Skip profile cleanup');
        console.log('\nSafety:');
        console.log('  - Only deletes test/temp profiles (not production profiles)');
        console.log('  - Compresses large logs instead of deleting them');
        console.log('  - Requires confirmation for destructive operations');
        console.log('  - Use --dry-run to preview changes safely');
        process.exit(0);
    }

    const cleaner = new SystemCleaner();

    try {
        await cleaner.runCleanup(options);

        const exitCode = cleaner.stats.errors.length > 0 ? 1 : 0;
        process.exit(exitCode);

    } catch (error) {
        console.error(chalk.red('Cleanup failed:'), error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('Unhandled cleanup error:'), error);
        process.exit(1);
    });
}

module.exports = SystemCleaner;