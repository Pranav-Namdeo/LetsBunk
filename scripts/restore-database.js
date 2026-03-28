/**
 * MongoDB Database Restore Script
 * 
 * This script restores a MongoDB database from a backup created by backup-database.js
 * 
 * Usage:
 *   node scripts/restore-database.js <backup-folder-name>
 *   
 * Example:
 *   node scripts/restore-database.js backup_2024-01-15_14-30-00
 * 
 * Environment Variables Required:
 *   MONGODB_URI - MongoDB connection string
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Get backup folder from command line argument
const backupFolderName = process.argv[2];

if (!backupFolderName) {
    console.error('❌ Error: Please provide backup folder name');
    console.log('\nUsage: node scripts/restore-database.js <backup-folder-name>');
    console.log('Example: node scripts/restore-database.js backup_2024-01-15_14-30-00');
    console.log('\nAvailable backups:');
    
    const BACKUP_DIR = path.join(__dirname, '..', 'backups');
    if (fs.existsSync(BACKUP_DIR)) {
        const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup_'));
        backups.forEach(backup => console.log(`  - ${backup}`));
    } else {
        console.log('  No backups found');
    }
    
    process.exit(1);
}

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const BACKUP_PATH = path.join(BACKUP_DIR, backupFolderName);

/**
 * Validate backup directory exists
 */
function validateBackupDirectory() {
    if (!fs.existsSync(BACKUP_PATH)) {
        console.error(`❌ Error: Backup directory not found: ${BACKUP_PATH}`);
        process.exit(1);
    }
    
    const metadataPath = path.join(BACKUP_PATH, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
        console.error(`❌ Error: Backup metadata not found: ${metadataPath}`);
        process.exit(1);
    }
    
    console.log(`✅ Found backup directory: ${BACKUP_PATH}`);
}

/**
 * Load backup metadata
 */
function loadMetadata() {
    const metadataPath = path.join(BACKUP_PATH, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    console.log('\n📋 Backup Metadata:');
    console.log(`   Backup Date: ${metadata.backupDate}`);
    console.log(`   Database: ${metadata.databaseName}`);
    console.log(`   Total Documents: ${metadata.totalDocuments}`);
    console.log(`   Collections: ${metadata.collections.length}`);
    
    return metadata;
}

/**
 * Restore a single collection
 */
async function restoreCollection(collectionName, filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  File not found for collection '${collectionName}', skipping...`);
            return { collection: collectionName, count: 0, status: 'skipped' };
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (data.length === 0) {
            console.log(`⚠️  Collection '${collectionName}' has no data, skipping...`);
            return { collection: collectionName, count: 0, status: 'empty' };
        }
        
        console.log(`📦 Restoring collection '${collectionName}' (${data.length} documents)...`);
        
        const collection = mongoose.connection.db.collection(collectionName);
        
        // Clear existing data (optional - comment out if you want to merge)
        await collection.deleteMany({});
        
        // Insert backup data
        await collection.insertMany(data);
        
        console.log(`✅ Restored ${data.length} documents to '${collectionName}'`);
        return { collection: collectionName, count: data.length, status: 'success' };
        
    } catch (error) {
        console.error(`❌ Error restoring collection '${collectionName}':`, error.message);
        return { collection: collectionName, count: 0, status: 'error', error: error.message };
    }
}

/**
 * Main restore function
 */
async function performRestore() {
    console.log('🚀 Starting MongoDB Database Restore...\n');
    
    try {
        // Validate backup directory
        validateBackupDirectory();
        
        // Load metadata
        const metadata = loadMetadata();
        
        // Connect to MongoDB
        console.log('\n🔌 Connecting to MongoDB...');
        const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';
        
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });
        
        console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}\n`);
        
        // Confirm restore operation
        console.log('⚠️  WARNING: This will replace all data in the current database!');
        console.log(`   Current Database: ${mongoose.connection.name}`);
        console.log(`   Backup Database: ${metadata.databaseName}`);
        
        if (mongoose.connection.name !== metadata.databaseName) {
            console.log('\n⚠️  WARNING: Database names do not match!');
            console.log('   This may cause issues. Proceeding anyway...\n');
        }
        
        // Get all JSON files in backup directory
        const files = fs.readdirSync(BACKUP_PATH).filter(f => f.endsWith('.json') && f !== 'metadata.json');
        
        console.log(`📚 Found ${files.length} collection backups to restore\n`);
        
        // Restore each collection
        const results = [];
        for (const file of files) {
            const collectionName = path.basename(file, '.json');
            const filePath = path.join(BACKUP_PATH, file);
            const result = await restoreCollection(collectionName, filePath);
            results.push(result);
        }
        
        // Summary
        const successCount = results.filter(r => r.status === 'success').length;
        const totalDocs = results.reduce((sum, r) => sum + r.count, 0);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ RESTORE COMPLETED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`📊 Collections Restored: ${successCount}`);
        console.log(`📄 Total Documents: ${totalDocs}`);
        console.log(`📁 Backup Source: ${BACKUP_PATH}`);
        console.log('='.repeat(60) + '\n');
        
        // Close connection
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
        
        return results;
        
    } catch (error) {
        console.error('\n❌ RESTORE FAILED:', error.message);
        console.error(error.stack);
        
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        
        process.exit(1);
    }
}

// Run restore if executed directly
if (require.main === module) {
    performRestore()
        .then(() => {
            console.log('✅ Restore script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Restore script failed:', error);
            process.exit(1);
        });
}

module.exports = { performRestore };
