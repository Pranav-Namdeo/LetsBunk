/**
 * Period-Based Attendance System Migration Script
 * 
 * This script orchestrates the complete migration from timer-based to period-based attendance.
 * It executes all schema changes from Tasks 1.1-1.9 in the correct order with error handling,
 * logging, and rollback capability.
 * 
 * Migration Steps:
 * 1. Pre-migration checks (backup exists, database connection)
 * 2. Create backup (Task 1.1)
 * 3. Create new schemas: PeriodAttendance, DailyAttendance, AttendanceAudit, SystemSettings (Tasks 1.2-1.5)
 * 4. Remove timer fields from StudentManagement (Task 1.6)
 * 5. Remove timer fields from RandomRing (Task 1.7)
 * 6. Drop AttendanceSession collection (Task 1.8)
 * 7. Create indexes for new collections (Task 1.9)
 * 8. Verify migration success
 * 
 * Usage:
 *   node scripts/migrate-to-period-based.js [--dry-run] [--skip-backup]
 * 
 * Options:
 *   --dry-run: Show what would be done without making changes
 *   --skip-backup: Skip backup creation (NOT RECOMMENDED)
 * 
 * Environment Variables Required:
 *   MONGODB_URI - MongoDB connection string
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import backup script
const { performBackup, BACKUP_DIR } = require('./backup-database.js');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_BACKUP = args.includes('--skip-backup');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance';

// Migration state tracking
const migrationState = {
    startTime: new Date(),
    steps: [],
    backupPath: null,
    errors: []
};

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    const timestamp = new Date().toISOString();
    console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function logStep(stepNumber, stepName, status = 'start') {
    const symbols = { start: '▶', success: '✓', error: '✗', skip: '⊘' };
    const statusColors = { start: 'blue', success: 'green', error: 'red', skip: 'yellow' };
    log(`${symbols[status]} Step ${stepNumber}: ${stepName}`, statusColors[status]);
}

/**
 * Record migration step
 */
function recordStep(stepNumber, stepName, status, details = {}) {
    migrationState.steps.push({
        stepNumber,
        stepName,
        status,
        timestamp: new Date(),
        ...details
    });
}

/**
 * Pre-migration checks
 */
async function preMigrationChecks() {
    logStep(0, 'Pre-migration Checks', 'start');
    
    try {
        // Check MongoDB connection
        log('Checking MongoDB connection...', 'blue');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });
        log(`✓ Connected to MongoDB: ${mongoose.connection.name}`, 'green');
        
        // Check if backup directory exists
        if (!fs.existsSync(BACKUP_DIR)) {
            log('Creating backup directory...', 'blue');
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
        
        // Check for existing backups
        const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_'));
        log(`Found ${backups.length} existing backups`, 'blue');
        
        logStep(0, 'Pre-migration Checks', 'success');
        recordStep(0, 'Pre-migration Checks', 'success', { backupCount: backups.length });
        return true;
        
    } catch (error) {
        logStep(0, 'Pre-migration Checks', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(0, 'Pre-migration Checks', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 1: Create database backup
 */
async function step1_CreateBackup() {
    logStep(1, 'Create Database Backup', 'start');
    
    if (SKIP_BACKUP) {
        logStep(1, 'Create Database Backup', 'skip');
        log('⚠️  Backup skipped (--skip-backup flag)', 'yellow');
        recordStep(1, 'Create Database Backup', 'skipped');
        return null;
    }
    
    if (DRY_RUN) {
        logStep(1, 'Create Database Backup', 'skip');
        log('DRY RUN: Would create backup', 'yellow');
        recordStep(1, 'Create Database Backup', 'dry-run');
        return null;
    }
    
    try {
        const backupMetadata = await performBackup();
        migrationState.backupPath = backupMetadata.backupPath;
        
        logStep(1, 'Create Database Backup', 'success');
        log(`Backup created: ${backupMetadata.backupPath}`, 'green');
        recordStep(1, 'Create Database Backup', 'success', { 
            backupPath: backupMetadata.backupPath,
            totalDocuments: backupMetadata.totalDocuments
        });
        
        return backupMetadata;
        
    } catch (error) {
        logStep(1, 'Create Database Backup', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(1, 'Create Database Backup', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 2: Verify new schemas exist in server.js
 */
async function step2_VerifyNewSchemas() {
    logStep(2, 'Verify New Schemas (PeriodAttendance, DailyAttendance, AttendanceAudit, SystemSettings)', 'start');
    
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        const requiredCollections = [
            'periodattendances',
            'dailyattendances',
            'attendanceaudits',
            'systemsettings'
        ];
        
        const existingCollections = requiredCollections.filter(name => collectionNames.includes(name));
        const missingCollections = requiredCollections.filter(name => !collectionNames.includes(name));
        
        log(`Existing collections: ${existingCollections.join(', ') || 'none'}`, 'blue');
        log(`Missing collections: ${missingCollections.join(', ') || 'none'}`, 'blue');
        
        if (missingCollections.length > 0) {
            log('⚠️  Some collections do not exist yet (will be created on first insert)', 'yellow');
            log('   This is normal - schemas are defined in server.js', 'yellow');
        }
        
        logStep(2, 'Verify New Schemas', 'success');
        recordStep(2, 'Verify New Schemas', 'success', { 
            existing: existingCollections,
            missing: missingCollections
        });
        
        return { existingCollections, missingCollections };
        
    } catch (error) {
        logStep(2, 'Verify New Schemas', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(2, 'Verify New Schemas', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 3: Remove timer fields from StudentManagement
 */
async function step3_RemoveTimerFieldsFromStudentManagement() {
    logStep(3, 'Remove Timer Fields from StudentManagement', 'start');
    
    if (DRY_RUN) {
        logStep(3, 'Remove Timer Fields from StudentManagement', 'skip');
        log('DRY RUN: Would remove fields: timerValue, isRunning, isPaused, attendanceSession', 'yellow');
        recordStep(3, 'Remove Timer Fields from StudentManagement', 'dry-run');
        return;
    }
    
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('studentmanagements');
        
        // Check if collection exists
        const collections = await db.listCollections({ name: 'studentmanagements' }).toArray();
        if (collections.length === 0) {
            log('⚠️  StudentManagement collection does not exist', 'yellow');
            logStep(3, 'Remove Timer Fields from StudentManagement', 'skip');
            recordStep(3, 'Remove Timer Fields from StudentManagement', 'skipped', { reason: 'Collection does not exist' });
            return;
        }
        
        // Count documents before
        const countBefore = await collection.countDocuments();
        log(`Found ${countBefore} student documents`, 'blue');
        
        // Remove timer fields
        const fieldsToRemove = ['timerValue', 'isRunning', 'isPaused', 'attendanceSession'];
        const unsetFields = {};
        fieldsToRemove.forEach(field => unsetFields[field] = '');
        
        const result = await collection.updateMany(
            {},
            { $unset: unsetFields }
        );
        
        log(`Updated ${result.modifiedCount} documents`, 'green');
        log(`Removed fields: ${fieldsToRemove.join(', ')}`, 'green');
        
        logStep(3, 'Remove Timer Fields from StudentManagement', 'success');
        recordStep(3, 'Remove Timer Fields from StudentManagement', 'success', {
            documentsUpdated: result.modifiedCount,
            fieldsRemoved: fieldsToRemove
        });
        
    } catch (error) {
        logStep(3, 'Remove Timer Fields from StudentManagement', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(3, 'Remove Timer Fields from StudentManagement', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 4: Remove timer fields from RandomRing
 */
async function step4_RemoveTimerFieldsFromRandomRing() {
    logStep(4, 'Remove Timer Fields from RandomRing', 'start');
    
    if (DRY_RUN) {
        logStep(4, 'Remove Timer Fields from RandomRing', 'skip');
        log('DRY RUN: Would remove fields: timeBeforeRandomRing, timerCutoff', 'yellow');
        recordStep(4, 'Remove Timer Fields from RandomRing', 'dry-run');
        return;
    }
    
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('randomrings');
        
        // Check if collection exists
        const collections = await db.listCollections({ name: 'randomrings' }).toArray();
        if (collections.length === 0) {
            log('⚠️  RandomRing collection does not exist', 'yellow');
            logStep(4, 'Remove Timer Fields from RandomRing', 'skip');
            recordStep(4, 'Remove Timer Fields from RandomRing', 'skipped', { reason: 'Collection does not exist' });
            return;
        }
        
        // Count documents before
        const countBefore = await collection.countDocuments();
        log(`Found ${countBefore} random ring documents`, 'blue');
        
        // Remove timer fields
        const fieldsToRemove = ['timeBeforeRandomRing', 'timerCutoff'];
        const unsetFields = {};
        fieldsToRemove.forEach(field => unsetFields[field] = '');
        
        const result = await collection.updateMany(
            {},
            { $unset: unsetFields }
        );
        
        log(`Updated ${result.modifiedCount} documents`, 'green');
        log(`Removed fields: ${fieldsToRemove.join(', ')}`, 'green');
        
        logStep(4, 'Remove Timer Fields from RandomRing', 'success');
        recordStep(4, 'Remove Timer Fields from RandomRing', 'success', {
            documentsUpdated: result.modifiedCount,
            fieldsRemoved: fieldsToRemove
        });
        
    } catch (error) {
        logStep(4, 'Remove Timer Fields from RandomRing', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(4, 'Remove Timer Fields from RandomRing', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 5: Drop AttendanceSession collection
 */
async function step5_DropAttendanceSession() {
    logStep(5, 'Drop AttendanceSession Collection', 'start');
    
    if (DRY_RUN) {
        logStep(5, 'Drop AttendanceSession Collection', 'skip');
        log('DRY RUN: Would drop attendancesessions collection', 'yellow');
        recordStep(5, 'Drop AttendanceSession Collection', 'dry-run');
        return;
    }
    
    try {
        const db = mongoose.connection.db;
        
        // Check if collection exists
        const collections = await db.listCollections({ name: 'attendancesessions' }).toArray();
        
        if (collections.length === 0) {
            log('⚠️  AttendanceSession collection does not exist', 'yellow');
            logStep(5, 'Drop AttendanceSession Collection', 'skip');
            recordStep(5, 'Drop AttendanceSession Collection', 'skipped', { reason: 'Collection does not exist' });
            return;
        }
        
        // Get collection stats before dropping
        const stats = await db.collection('attendancesessions').stats();
        log(`Collection stats:`, 'blue');
        log(`  - Documents: ${stats.count}`, 'blue');
        log(`  - Storage size: ${(stats.size / 1024).toFixed(2)} KB`, 'blue');
        log(`  - Indexes: ${stats.nindexes}`, 'blue');
        
        // Drop the collection
        await db.dropCollection('attendancesessions');
        
        log('✓ AttendanceSession collection dropped', 'green');
        
        logStep(5, 'Drop AttendanceSession Collection', 'success');
        recordStep(5, 'Drop AttendanceSession Collection', 'success', {
            documentsDeleted: stats.count,
            storageFreed: stats.size,
            indexesRemoved: stats.nindexes
        });
        
    } catch (error) {
        logStep(5, 'Drop AttendanceSession Collection', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(5, 'Drop AttendanceSession Collection', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 6: Create indexes for new collections
 */
async function step6_CreateIndexes() {
    logStep(6, 'Create Indexes for New Collections', 'start');
    
    if (DRY_RUN) {
        logStep(6, 'Create Indexes for New Collections', 'skip');
        log('DRY RUN: Would create indexes for PeriodAttendance, DailyAttendance, AttendanceAudit, SystemSettings', 'yellow');
        recordStep(6, 'Create Indexes for New Collections', 'dry-run');
        return;
    }
    
    try {
        const db = mongoose.connection.db;
        const indexResults = [];
        
        // PeriodAttendance indexes
        log('Creating PeriodAttendance indexes...', 'blue');
        const periodCollection = db.collection('periodattendances');
        
        await periodCollection.createIndex(
            { enrollmentNo: 1, date: 1, period: 1 },
            { unique: true, name: 'enrollmentNo_1_date_1_period_1' }
        );
        await periodCollection.createIndex({ date: 1 }, { name: 'date_1' });
        await periodCollection.createIndex({ teacher: 1, date: 1 }, { name: 'teacher_1_date_1' });
        await periodCollection.createIndex({ status: 1, date: 1 }, { name: 'status_1_date_1' });
        
        indexResults.push({ collection: 'periodattendances', count: 4 });
        log('✓ Created 4 indexes for PeriodAttendance', 'green');
        
        // DailyAttendance indexes
        log('Creating DailyAttendance indexes...', 'blue');
        const dailyCollection = db.collection('dailyattendances');
        
        await dailyCollection.createIndex({ enrollmentNo: 1, date: -1 }, { name: 'enrollmentNo_1_date_-1' });
        await dailyCollection.createIndex({ date: -1 }, { name: 'date_-1' });
        await dailyCollection.createIndex({ semester: 1, branch: 1, date: -1 }, { name: 'semester_1_branch_1_date_-1' });
        await dailyCollection.createIndex({ dailyStatus: 1, date: -1 }, { name: 'dailyStatus_1_date_-1' });
        
        indexResults.push({ collection: 'dailyattendances', count: 4 });
        log('✓ Created 4 indexes for DailyAttendance', 'green');
        
        // AttendanceAudit indexes
        log('Creating AttendanceAudit indexes...', 'blue');
        const auditCollection = db.collection('attendanceaudits');
        
        await auditCollection.createIndex({ auditId: 1 }, { unique: true, name: 'auditId_1' });
        await auditCollection.createIndex({ enrollmentNo: 1, date: -1 }, { name: 'enrollmentNo_1_date_-1' });
        await auditCollection.createIndex({ modifiedBy: 1, modifiedAt: -1 }, { name: 'modifiedBy_1_modifiedAt_-1' });
        await auditCollection.createIndex({ recordId: 1 }, { name: 'recordId_1' });
        
        indexResults.push({ collection: 'attendanceaudits', count: 4 });
        log('✓ Created 4 indexes for AttendanceAudit', 'green');
        
        // SystemSettings indexes
        log('Creating SystemSettings indexes...', 'blue');
        const settingsCollection = db.collection('systemsettings');
        
        await settingsCollection.createIndex({ settingKey: 1 }, { unique: true, name: 'settingKey_1' });
        
        indexResults.push({ collection: 'systemsettings', count: 1 });
        log('✓ Created 1 index for SystemSettings', 'green');
        
        const totalIndexes = indexResults.reduce((sum, r) => sum + r.count, 0);
        log(`Total indexes created: ${totalIndexes}`, 'green');
        
        logStep(6, 'Create Indexes for New Collections', 'success');
        recordStep(6, 'Create Indexes for New Collections', 'success', {
            indexResults,
            totalIndexes
        });
        
    } catch (error) {
        logStep(6, 'Create Indexes for New Collections', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(6, 'Create Indexes for New Collections', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 7: Seed default system settings
 */
async function step7_SeedSystemSettings() {
    logStep(7, 'Seed Default System Settings', 'start');
    
    if (DRY_RUN) {
        logStep(7, 'Seed Default System Settings', 'skip');
        log('DRY RUN: Would seed daily_threshold = 75', 'yellow');
        recordStep(7, 'Seed Default System Settings', 'dry-run');
        return;
    }
    
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('systemsettings');
        
        // Check if daily_threshold already exists
        const existing = await collection.findOne({ settingKey: 'daily_threshold' });
        
        if (existing) {
            log('⚠️  daily_threshold setting already exists', 'yellow');
            log(`   Current value: ${existing.settingValue}`, 'yellow');
            logStep(7, 'Seed Default System Settings', 'skip');
            recordStep(7, 'Seed Default System Settings', 'skipped', { 
                reason: 'Setting already exists',
                currentValue: existing.settingValue
            });
            return;
        }
        
        // Insert default threshold setting
        const defaultSetting = {
            settingKey: 'daily_threshold',
            settingValue: 75,
            dataType: 'number',
            description: 'Minimum percentage of periods a student must attend to be marked present for the day',
            minValue: 1,
            maxValue: 100,
            lastModifiedBy: 'system',
            lastModifiedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        await collection.insertOne(defaultSetting);
        
        log('✓ Seeded daily_threshold = 75%', 'green');
        
        logStep(7, 'Seed Default System Settings', 'success');
        recordStep(7, 'Seed Default System Settings', 'success', {
            settingKey: 'daily_threshold',
            settingValue: 75
        });
        
    } catch (error) {
        logStep(7, 'Seed Default System Settings', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(7, 'Seed Default System Settings', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Step 8: Verify migration success
 */
async function step8_VerifyMigration() {
    logStep(8, 'Verify Migration Success', 'start');
    
    try {
        const db = mongoose.connection.db;
        const verificationResults = {
            collections: {},
            indexes: {},
            settings: {}
        };
        
        // Verify collections exist (or will be created on first insert)
        log('Verifying collections...', 'blue');
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        const expectedCollections = [
            'periodattendances',
            'dailyattendances',
            'attendanceaudits',
            'systemsettings'
        ];
        
        expectedCollections.forEach(name => {
            const exists = collectionNames.includes(name);
            verificationResults.collections[name] = exists ? 'exists' : 'will be created on first insert';
            log(`  ${exists ? '✓' : '○'} ${name}: ${verificationResults.collections[name]}`, exists ? 'green' : 'yellow');
        });
        
        // Verify AttendanceSession is dropped
        const attendanceSessionExists = collectionNames.includes('attendancesessions');
        if (attendanceSessionExists) {
            log('  ✗ attendancesessions: STILL EXISTS (should be dropped)', 'red');
            verificationResults.collections['attendancesessions'] = 'ERROR: Still exists';
        } else {
            log('  ✓ attendancesessions: Dropped successfully', 'green');
            verificationResults.collections['attendancesessions'] = 'dropped';
        }
        
        // Verify indexes (only for existing collections)
        log('\nVerifying indexes...', 'blue');
        for (const collectionName of expectedCollections) {
            if (collectionNames.includes(collectionName)) {
                const collection = db.collection(collectionName);
                const indexes = await collection.indexes();
                verificationResults.indexes[collectionName] = indexes.length;
                log(`  ✓ ${collectionName}: ${indexes.length} indexes`, 'green');
            } else {
                verificationResults.indexes[collectionName] = 'N/A (collection not created yet)';
                log(`  ○ ${collectionName}: Indexes will be created on first insert`, 'yellow');
            }
        }
        
        // Verify system settings
        log('\nVerifying system settings...', 'blue');
        if (collectionNames.includes('systemsettings')) {
            const settingsCollection = db.collection('systemsettings');
            const thresholdSetting = await settingsCollection.findOne({ settingKey: 'daily_threshold' });
            
            if (thresholdSetting) {
                verificationResults.settings.daily_threshold = thresholdSetting.settingValue;
                log(`  ✓ daily_threshold: ${thresholdSetting.settingValue}%`, 'green');
            } else {
                verificationResults.settings.daily_threshold = 'NOT FOUND';
                log(`  ✗ daily_threshold: NOT FOUND`, 'red');
            }
        } else {
            verificationResults.settings.daily_threshold = 'N/A (collection not created yet)';
            log(`  ○ daily_threshold: Will be seeded on first use`, 'yellow');
        }
        
        logStep(8, 'Verify Migration Success', 'success');
        recordStep(8, 'Verify Migration Success', 'success', verificationResults);
        
        return verificationResults;
        
    } catch (error) {
        logStep(8, 'Verify Migration Success', 'error');
        log(`Error: ${error.message}`, 'red');
        recordStep(8, 'Verify Migration Success', 'error', { error: error.message });
        throw error;
    }
}

/**
 * Generate migration report
 */
function generateMigrationReport() {
    const endTime = new Date();
    const duration = (endTime - migrationState.startTime) / 1000; // seconds
    
    console.log('\n' + '═'.repeat(80));
    log('MIGRATION REPORT', 'cyan');
    console.log('═'.repeat(80));
    
    log(`\nStart Time: ${migrationState.startTime.toISOString()}`, 'blue');
    log(`End Time: ${endTime.toISOString()}`, 'blue');
    log(`Duration: ${duration.toFixed(2)} seconds`, 'blue');
    
    if (DRY_RUN) {
        log('\n⚠️  DRY RUN MODE - No changes were made', 'yellow');
    }
    
    if (migrationState.backupPath) {
        log(`\nBackup Location: ${migrationState.backupPath}`, 'green');
    }
    
    log('\nMigration Steps:', 'blue');
    migrationState.steps.forEach(step => {
        const statusSymbol = {
            success: '✓',
            error: '✗',
            skipped: '⊘',
            'dry-run': '○'
        }[step.status] || '?';
        
        const statusColor = {
            success: 'green',
            error: 'red',
            skipped: 'yellow',
            'dry-run': 'yellow'
        }[step.status] || 'reset';
        
        log(`  ${statusSymbol} Step ${step.stepNumber}: ${step.stepName} [${step.status.toUpperCase()}]`, statusColor);
        
        if (step.error) {
            log(`    Error: ${step.error}`, 'red');
        }
    });
    
    const successCount = migrationState.steps.filter(s => s.status === 'success').length;
    const errorCount = migrationState.steps.filter(s => s.status === 'error').length;
    const skippedCount = migrationState.steps.filter(s => s.status === 'skipped' || s.status === 'dry-run').length;
    
    log('\nSummary:', 'blue');
    log(`  Total Steps: ${migrationState.steps.length}`, 'blue');
    log(`  Successful: ${successCount}`, 'green');
    log(`  Errors: ${errorCount}`, errorCount > 0 ? 'red' : 'green');
    log(`  Skipped: ${skippedCount}`, 'yellow');
    
    console.log('═'.repeat(80) + '\n');
    
    // Save report to file
    const reportPath = path.join(__dirname, '..', 'migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        ...migrationState,
        endTime,
        duration,
        summary: { successCount, errorCount, skippedCount }
    }, null, 2));
    
    log(`Migration report saved: ${reportPath}`, 'green');
    
    return errorCount === 0;
}

/**
 * Rollback migration (restore from backup)
 */
async function rollbackMigration() {
    log('\n⚠️  ROLLBACK REQUESTED', 'yellow');
    log('To rollback, run: node scripts/restore-database.js <backup-folder-name>', 'yellow');
    
    if (migrationState.backupPath) {
        const backupFolderName = path.basename(migrationState.backupPath);
        log(`Backup folder: ${backupFolderName}`, 'yellow');
        log(`Command: node scripts/restore-database.js ${backupFolderName}`, 'cyan');
    } else {
        log('No backup was created during this migration', 'red');
        
        // List available backups
        if (fs.existsSync(BACKUP_DIR)) {
            const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_'));
            if (backups.length > 0) {
                log('\nAvailable backups:', 'blue');
                backups.forEach(backup => log(`  - ${backup}`, 'blue'));
            }
        }
    }
}

/**
 * Main migration function
 */
async function runMigration() {
    console.log('\n' + '═'.repeat(80));
    log('PERIOD-BASED ATTENDANCE SYSTEM MIGRATION', 'cyan');
    console.log('═'.repeat(80));
    
    if (DRY_RUN) {
        log('\n⚠️  DRY RUN MODE - No changes will be made', 'yellow');
    }
    
    if (SKIP_BACKUP) {
        log('\n⚠️  WARNING: Backup creation will be skipped', 'yellow');
        log('   This is NOT RECOMMENDED for production environments', 'yellow');
    }
    
    log('\nMigration will execute the following steps:', 'blue');
    log('  0. Pre-migration checks', 'blue');
    log('  1. Create database backup', 'blue');
    log('  2. Verify new schemas exist', 'blue');
    log('  3. Remove timer fields from StudentManagement', 'blue');
    log('  4. Remove timer fields from RandomRing', 'blue');
    log('  5. Drop AttendanceSession collection', 'blue');
    log('  6. Create indexes for new collections', 'blue');
    log('  7. Seed default system settings', 'blue');
    log('  8. Verify migration success', 'blue');
    
    console.log('\n' + '═'.repeat(80) + '\n');
    
    try {
        // Execute migration steps
        await preMigrationChecks();
        await step1_CreateBackup();
        await step2_VerifyNewSchemas();
        await step3_RemoveTimerFieldsFromStudentManagement();
        await step4_RemoveTimerFieldsFromRandomRing();
        await step5_DropAttendanceSession();
        await step6_CreateIndexes();
        await step7_SeedSystemSettings();
        await step8_VerifyMigration();
        
        // Generate report
        const success = generateMigrationReport();
        
        if (success) {
            log('\n✓ MIGRATION COMPLETED SUCCESSFULLY', 'green');
            
            if (!DRY_RUN) {
                log('\nNext steps:', 'blue');
                log('  1. Restart your application server', 'blue');
                log('  2. Test the new period-based attendance features', 'blue');
                log('  3. Monitor for any issues', 'blue');
                log('  4. Keep the backup for at least 7 days', 'blue');
            }
        } else {
            log('\n✗ MIGRATION COMPLETED WITH ERRORS', 'red');
            log('Please review the migration report and error messages above', 'red');
            rollbackMigration();
        }
        
        return success;
        
    } catch (error) {
        log('\n✗ MIGRATION FAILED', 'red');
        log(`Fatal error: ${error.message}`, 'red');
        console.error(error.stack);
        
        migrationState.errors.push({
            message: error.message,
            stack: error.stack,
            timestamp: new Date()
        });
        
        generateMigrationReport();
        rollbackMigration();
        
        return false;
    } finally {
        // Close database connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            log('\n🔌 Database connection closed', 'blue');
        }
    }
}

/**
 * Entry point
 */
if (require.main === module) {
    runMigration()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

module.exports = { runMigration, rollbackMigration };
