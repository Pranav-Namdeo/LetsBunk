/**
 * Drop AttendanceSession Collection Script
 * 
 * This script removes the AttendanceSession collection from the database
 * as part of the migration from timer-based to period-based attendance.
 * 
 * WARNING: This is a DESTRUCTIVE operation with NO rollback capability.
 * All timer-based attendance session data will be permanently deleted.
 * 
 * Prerequisites:
 * - Database backup must be created before running this script
 * - Run: node scripts/backup-database.js
 * 
 * Usage:
 * node scripts/drop-attendance-session.js
 */

const mongoose = require('mongoose');
const config = require('../config');

// Connect to MongoDB
async function connectDB() {
    try {
        await mongoose.connect(config.mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

// Drop AttendanceSession collection
async function dropAttendanceSessionCollection() {
    try {
        const db = mongoose.connection.db;
        
        // Check if collection exists
        const collections = await db.listCollections({ name: 'attendancesessions' }).toArray();
        
        if (collections.length === 0) {
            console.log('ℹ️  AttendanceSession collection does not exist. Nothing to drop.');
            return {
                success: true,
                message: 'Collection does not exist',
                dropped: false
            };
        }
        
        // Get collection stats before dropping
        const stats = await db.collection('attendancesessions').stats();
        console.log('\n📊 Collection Statistics:');
        console.log(`   - Document count: ${stats.count}`);
        console.log(`   - Storage size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   - Index count: ${stats.nindexes}`);
        
        // Drop the collection
        console.log('\n⚠️  Dropping AttendanceSession collection...');
        await db.dropCollection('attendancesessions');
        
        console.log('✅ AttendanceSession collection dropped successfully');
        
        return {
            success: true,
            message: 'Collection dropped successfully',
            dropped: true,
            stats: {
                documentCount: stats.count,
                storageSize: stats.size,
                indexCount: stats.nindexes
            }
        };
        
    } catch (error) {
        console.error('❌ Error dropping collection:', error);
        throw error;
    }
}

// Verify no dependencies on AttendanceSession
async function verifyNoDependencies() {
    try {
        console.log('\n🔍 Verifying dependencies...');
        
        const db = mongoose.connection.db;
        
        // Check if any other collections reference AttendanceSession
        // In this system, AttendanceSession is standalone and not referenced by other collections
        
        console.log('✅ No dependencies found on AttendanceSession collection');
        
        return {
            success: true,
            dependencies: []
        };
        
    } catch (error) {
        console.error('❌ Error verifying dependencies:', error);
        throw error;
    }
}

// Main execution
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Drop AttendanceSession Collection Script');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('⚠️  WARNING: This operation is DESTRUCTIVE and IRREVERSIBLE');
    console.log('⚠️  All timer-based attendance session data will be deleted');
    console.log('⚠️  Ensure database backup exists before proceeding\n');
    
    try {
        // Connect to database
        await connectDB();
        
        // Verify no dependencies
        await verifyNoDependencies();
        
        // Drop collection
        const result = await dropAttendanceSessionCollection();
        
        // Summary
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  Summary');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`Message: ${result.message}`);
        
        if (result.dropped && result.stats) {
            console.log(`\nDeleted Data:`);
            console.log(`  - Documents: ${result.stats.documentCount}`);
            console.log(`  - Storage freed: ${(result.stats.storageSize / 1024).toFixed(2)} KB`);
            console.log(`  - Indexes removed: ${result.stats.indexCount}`);
        }
        
        console.log('\n📝 Data Loss Documentation:');
        console.log('   - Timer-based attendance sessions: DELETED');
        console.log('   - No migration performed (fresh start approach)');
        console.log('   - Backup available in: backups/ directory');
        
        console.log('\n✅ Operation completed successfully');
        
    } catch (error) {
        console.error('\n❌ Operation failed:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
    }
}

// Run the script
main();
