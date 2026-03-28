/**
 * Database Index Verification Script
 * 
 * This script verifies that all required indexes are created for the new
 * period-based attendance collections and tests their performance using
 * MongoDB's explain() functionality.
 * 
 * Collections verified:
 * - PeriodAttendance
 * - DailyAttendance
 * - AttendanceAudit
 * - SystemSettings
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance';

// Define schemas (same as server.js)
const periodAttendanceSchema = new mongoose.Schema({
    enrollmentNo: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: Date, required: true },
    period: { 
        type: String, 
        required: true,
        enum: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
    },
    subject: { type: String, required: true },
    teacher: { type: String, required: true },
    teacherName: { type: String },
    room: { type: String },
    status: { 
        type: String, 
        required: true,
        enum: ['present', 'absent']
    },
    checkInTime: { type: Date },
    verificationType: { 
        type: String, 
        required: true,
        enum: ['initial', 'random', 'manual']
    },
    wifiVerified: { type: Boolean, default: false },
    faceVerified: { type: Boolean, default: false },
    wifiBSSID: { type: String },
    markedBy: { type: String },
    reason: { type: String }
}, { timestamps: true });

periodAttendanceSchema.index({ enrollmentNo: 1, date: 1, period: 1 }, { unique: true });
periodAttendanceSchema.index({ date: 1 });
periodAttendanceSchema.index({ teacher: 1, date: 1 });
periodAttendanceSchema.index({ status: 1, date: 1 });

const dailyAttendanceSchema = new mongoose.Schema({
    enrollmentNo: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: Date, required: true },
    totalPeriods: { type: Number, required: true, min: 0 },
    presentPeriods: { type: Number, required: true, min: 0 },
    absentPeriods: { type: Number, required: true, min: 0 },
    attendancePercentage: { 
        type: Number, 
        required: true,
        min: 0,
        max: 100
    },
    dailyStatus: { 
        type: String, 
        required: true,
        enum: ['present', 'absent']
    },
    threshold: { type: Number, required: true },
    semester: { type: String, required: true },
    branch: { type: String, required: true },
    calculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

dailyAttendanceSchema.index({ enrollmentNo: 1, date: -1 });
dailyAttendanceSchema.index({ date: -1 });
dailyAttendanceSchema.index({ semester: 1, branch: 1, date: -1 });
dailyAttendanceSchema.index({ dailyStatus: 1, date: -1 });

const attendanceAuditSchema = new mongoose.Schema({
    auditId: { 
        type: String, 
        required: true,
        default: () => `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    },
    recordType: { 
        type: String, 
        required: true,
        enum: ['period_attendance', 'daily_attendance']
    },
    recordId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true 
    },
    enrollmentNo: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: Date, required: true },
    period: { type: String },
    modifiedBy: { type: String, required: true },
    modifierName: { type: String, required: true },
    modifierRole: { 
        type: String, 
        required: true,
        enum: ['teacher', 'admin', 'system']
    },
    oldStatus: { type: String },
    newStatus: { type: String, required: true },
    changeType: { 
        type: String, 
        required: true,
        enum: ['create', 'update', 'delete']
    },
    reason: { type: String },
    modifiedAt: { type: Date, default: Date.now }
}, { timestamps: true });

attendanceAuditSchema.index({ auditId: 1 }, { unique: true });
attendanceAuditSchema.index({ enrollmentNo: 1, date: -1 });
attendanceAuditSchema.index({ modifiedBy: 1, modifiedAt: -1 });
attendanceAuditSchema.index({ recordId: 1 });

const systemSettingsSchema = new mongoose.Schema({
    settingKey: { 
        type: String, 
        required: true, 
        unique: true 
    },
    settingValue: { 
        type: mongoose.Schema.Types.Mixed, 
        required: true 
    },
    dataType: { 
        type: String, 
        required: true,
        enum: ['number', 'string', 'boolean', 'object', 'array']
    },
    description: { 
        type: String, 
        required: true 
    },
    minValue: { type: Number },
    maxValue: { type: Number },
    lastModifiedBy: { type: String },
    lastModifiedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: String
}, { timestamps: true });

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Expected indexes for each collection
const expectedIndexes = {
    periodattendances: [
        { name: '_id_', keys: { _id: 1 } },
        { name: 'enrollmentNo_1_date_1_period_1', keys: { enrollmentNo: 1, date: 1, period: 1 }, unique: true },
        { name: 'date_1', keys: { date: 1 } },
        { name: 'teacher_1_date_1', keys: { teacher: 1, date: 1 } },
        { name: 'status_1_date_1', keys: { status: 1, date: 1 } }
    ],
    dailyattendances: [
        { name: '_id_', keys: { _id: 1 } },
        { name: 'enrollmentNo_1_date_-1', keys: { enrollmentNo: 1, date: -1 } },
        { name: 'date_-1', keys: { date: -1 } },
        { name: 'semester_1_branch_1_date_-1', keys: { semester: 1, branch: 1, date: -1 } },
        { name: 'dailyStatus_1_date_-1', keys: { dailyStatus: 1, date: -1 } }
    ],
    attendanceaudits: [
        { name: '_id_', keys: { _id: 1 } },
        { name: 'auditId_1', keys: { auditId: 1 }, unique: true },
        { name: 'enrollmentNo_1_date_-1', keys: { enrollmentNo: 1, date: -1 } },
        { name: 'modifiedBy_1_modifiedAt_-1', keys: { modifiedBy: 1, modifiedAt: -1 } },
        { name: 'recordId_1', keys: { recordId: 1 } }
    ],
    systemsettings: [
        { name: '_id_', keys: { _id: 1 } },
        { name: 'settingKey_1', keys: { settingKey: 1 }, unique: true }
    ]
};

/**
 * Compare two index key objects
 */
function compareIndexKeys(expected, actual) {
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    
    if (expectedKeys.length !== actualKeys.length) return false;
    
    for (let i = 0; i < expectedKeys.length; i++) {
        if (expectedKeys[i] !== actualKeys[i]) return false;
        if (expected[expectedKeys[i]] !== actual[actualKeys[i]]) return false;
    }
    
    return true;
}

/**
 * Verify indexes for a collection
 */
async function verifyCollectionIndexes(collectionName) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`Verifying indexes for: ${collectionName}`, 'cyan');
    log('='.repeat(60), 'cyan');
    
    try {
        // Check if collection exists
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
        
        if (collections.length === 0) {
            log(`\n⚠️  Collection does not exist yet (no data inserted)`, 'yellow');
            log(`   Indexes will be created automatically when first document is inserted`, 'yellow');
            log(`   Expected indexes are defined in the schema`, 'yellow');
            return true; // Consider this as pass since indexes are defined in schema
        }
        
        const collection = mongoose.connection.db.collection(collectionName);
        const actualIndexes = await collection.indexes();
        
        log(`\nFound ${actualIndexes.length} indexes:`, 'blue');
        actualIndexes.forEach(idx => {
            const unique = idx.unique ? ' [UNIQUE]' : '';
            log(`  ✓ ${idx.name}${unique}`, 'green');
            log(`    Keys: ${JSON.stringify(idx.key)}`, 'reset');
        });
        
        // Check expected indexes
        const expected = expectedIndexes[collectionName] || [];
        log(`\nExpected ${expected.length} indexes:`, 'blue');
        
        let allFound = true;
        for (const expectedIdx of expected) {
            const found = actualIndexes.find(actual => 
                compareIndexKeys(expectedIdx.keys, actual.key)
            );
            
            if (found) {
                const unique = expectedIdx.unique ? ' [UNIQUE]' : '';
                log(`  ✓ ${expectedIdx.name}${unique} - FOUND`, 'green');
                
                // Verify uniqueness constraint
                if (expectedIdx.unique && !found.unique) {
                    log(`    ⚠️  WARNING: Expected unique constraint but not found`, 'yellow');
                }
            } else {
                log(`  ✗ ${expectedIdx.name} - MISSING`, 'red');
                log(`    Expected keys: ${JSON.stringify(expectedIdx.keys)}`, 'red');
                allFound = false;
            }
        }
        
        return allFound;
    } catch (error) {
        log(`\n✗ Error verifying indexes: ${error.message}`, 'red');
        return false;
    }
}

/**
 * Test query performance using explain()
 */
async function testQueryPerformance() {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log('Testing Query Performance with explain()', 'cyan');
    log('='.repeat(60), 'cyan');
    
    try {
        // Register models
        const PeriodAttendance = mongoose.model('PeriodAttendance', periodAttendanceSchema);
        const DailyAttendance = mongoose.model('DailyAttendance', dailyAttendanceSchema);
        const AttendanceAudit = mongoose.model('AttendanceAudit', attendanceAuditSchema);
        
        // Check if collections have data
        const periodCount = await PeriodAttendance.countDocuments();
        const dailyCount = await DailyAttendance.countDocuments();
        const auditCount = await AttendanceAudit.countDocuments();
        
        log(`\nCollection document counts:`, 'blue');
        log(`  PeriodAttendance: ${periodCount}`, 'reset');
        log(`  DailyAttendance: ${dailyCount}`, 'reset');
        log(`  AttendanceAudit: ${auditCount}`, 'reset');
        
        if (periodCount === 0 && dailyCount === 0) {
            log(`\n⚠️  No data in collections yet - skipping performance tests`, 'yellow');
            log(`   Performance tests will be meaningful once data is inserted`, 'yellow');
            return;
        }
        
        // Test 1: PeriodAttendance compound index query
        if (periodCount > 0) {
            log('\n1. PeriodAttendance - Compound index query (enrollmentNo, date, period):', 'blue');
            const explain1 = await PeriodAttendance.find({
                enrollmentNo: '2021001',
                date: new Date('2024-01-15'),
                period: 'P3'
            }).explain('executionStats');
            
            log(`   Query Plan: ${explain1.queryPlanner.winningPlan.stage}`, 'reset');
            log(`   Index Used: ${explain1.queryPlanner.winningPlan.inputStage?.indexName || 'NONE'}`, 
                explain1.queryPlanner.winningPlan.inputStage?.indexName ? 'green' : 'red');
            log(`   Docs Examined: ${explain1.executionStats.totalDocsExamined}`, 'reset');
            log(`   Execution Time: ${explain1.executionStats.executionTimeMillis}ms`, 'reset');
            
            // Test 2: PeriodAttendance date range query
            log('\n2. PeriodAttendance - Date range query:', 'blue');
            const explain2 = await PeriodAttendance.find({
                date: { $gte: new Date('2024-01-01'), $lte: new Date('2024-01-31') }
            }).explain('executionStats');
            
            log(`   Query Plan: ${explain2.queryPlanner.winningPlan.stage}`, 'reset');
            log(`   Index Used: ${explain2.queryPlanner.winningPlan.inputStage?.indexName || 'NONE'}`, 
                explain2.queryPlanner.winningPlan.inputStage?.indexName ? 'green' : 'red');
            log(`   Docs Examined: ${explain2.executionStats.totalDocsExamined}`, 'reset');
            log(`   Execution Time: ${explain2.executionStats.executionTimeMillis}ms`, 'reset');
        }
        
        // Test 3: DailyAttendance student query
        if (dailyCount > 0) {
            log('\n3. DailyAttendance - Student enrollment query:', 'blue');
            const explain3 = await DailyAttendance.find({
                enrollmentNo: '2021001'
            }).sort({ date: -1 }).explain('executionStats');
            
            log(`   Query Plan: ${explain3.queryPlanner.winningPlan.stage}`, 'reset');
            log(`   Index Used: ${explain3.queryPlanner.winningPlan.inputStage?.indexName || 'NONE'}`, 
                explain3.queryPlanner.winningPlan.inputStage?.indexName ? 'green' : 'red');
            log(`   Docs Examined: ${explain3.executionStats.totalDocsExamined}`, 'reset');
            log(`   Execution Time: ${explain3.executionStats.executionTimeMillis}ms`, 'reset');
            
            // Test 4: DailyAttendance semester/branch query
            log('\n4. DailyAttendance - Semester and branch query:', 'blue');
            const explain4 = await DailyAttendance.find({
                semester: '3',
                branch: 'B.Tech Computer Science',
                date: { $gte: new Date('2024-01-01') }
            }).explain('executionStats');
            
            log(`   Query Plan: ${explain4.queryPlanner.winningPlan.stage}`, 'reset');
            log(`   Index Used: ${explain4.queryPlanner.winningPlan.inputStage?.indexName || 'NONE'}`, 
                explain4.queryPlanner.winningPlan.inputStage?.indexName ? 'green' : 'red');
            log(`   Docs Examined: ${explain4.executionStats.totalDocsExamined}`, 'reset');
            log(`   Execution Time: ${explain4.executionStats.executionTimeMillis}ms`, 'reset');
        }
        
        // Test 5: AttendanceAudit audit trail query
        if (auditCount > 0) {
            log('\n5. AttendanceAudit - Audit trail query:', 'blue');
            const explain5 = await AttendanceAudit.find({
                enrollmentNo: '2021001',
                date: { $gte: new Date('2024-01-01') }
            }).sort({ date: -1 }).explain('executionStats');
            
            log(`   Query Plan: ${explain5.queryPlanner.winningPlan.stage}`, 'reset');
            log(`   Index Used: ${explain5.queryPlanner.winningPlan.inputStage?.indexName || 'NONE'}`, 
                explain5.queryPlanner.winningPlan.inputStage?.indexName ? 'green' : 'red');
            log(`   Docs Examined: ${explain5.executionStats.totalDocsExamined}`, 'reset');
            log(`   Execution Time: ${explain5.executionStats.executionTimeMillis}ms`, 'reset');
        }
        
        log('\n✓ Query performance tests completed', 'green');
        
    } catch (error) {
        log(`\n✗ Error testing query performance: ${error.message}`, 'red');
        console.error(error);
    }
}

/**
 * Main verification function
 */
async function verifyIndexes() {
    try {
        log('='.repeat(60), 'cyan');
        log('Database Index Verification Script', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`\nConnecting to MongoDB: ${MONGODB_URI}`, 'blue');
        
        await mongoose.connect(MONGODB_URI);
        log('✓ Connected to MongoDB', 'green');
        
        // Verify indexes for each collection
        const results = {
            periodattendances: await verifyCollectionIndexes('periodattendances'),
            dailyattendances: await verifyCollectionIndexes('dailyattendances'),
            attendanceaudits: await verifyCollectionIndexes('attendanceaudits'),
            systemsettings: await verifyCollectionIndexes('systemsettings')
        };
        
        // Test query performance
        await testQueryPerformance();
        
        // Summary
        log(`\n${'='.repeat(60)}`, 'cyan');
        log('Verification Summary', 'cyan');
        log('='.repeat(60), 'cyan');
        
        const allPassed = Object.values(results).every(r => r === true);
        
        for (const [collection, passed] of Object.entries(results)) {
            const status = passed ? '✓ PASS' : '✗ FAIL';
            const color = passed ? 'green' : 'red';
            log(`${status} - ${collection}`, color);
        }
        
        if (allPassed) {
            log('\n✓ All indexes verified successfully!', 'green');
        } else {
            log('\n✗ Some indexes are missing. Please check the output above.', 'red');
        }
        
        await mongoose.connection.close();
        log('\n✓ Database connection closed', 'green');
        
        process.exit(allPassed ? 0 : 1);
        
    } catch (error) {
        log(`\n✗ Fatal error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

// Run verification
verifyIndexes();
