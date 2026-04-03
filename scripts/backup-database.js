/**
 * MongoDB Database Backup Script
 * 
 * This script creates a complete backup of the MongoDB database before migration.
 * It exports all collections to JSON files with timestamps.
 * 
 * Usage:
 *   node scripts/backup-database.js
 * 
 * Environment Variables Required:
 *   MONGODB_URI - MongoDB connection string
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Backup configuration
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                  new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
const BACKUP_PATH = path.join(BACKUP_DIR, `backup_${TIMESTAMP}`);

// Collections to backup
const COLLECTIONS_TO_BACKUP = [
    'studentmanagements',
    'teachers',
    'timetables',
    'attendancerecords',
    'attendancesessions',
    'classrooms',
    'randomrings',
    'systemconfigs'
];

/**
 * Create backup directory structure
 */
function createBackupDirectory() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`✅ Created backup directory: ${BACKUP_DIR}`);
    }
    
    if (!fs.existsSync(BACKUP_PATH)) {
        fs.mkdirSync(BACKUP_PATH, { recursive: true });
        console.log(`✅ Created backup path: ${BACKUP_PATH}`);
    }
}

/**
 * Backup a single collection
 */
async function backupCollection(collectionName) {
    try {
        const collection = mongoose.connection.db.collection(collectionName);
        const count = await collection.countDocuments();
        
        if (count === 0) {
            console.log(`⚠️  Collection '${collectionName}' is empty, skipping...`);
            return { collection: collectionName, count: 0, status: 'empty' };
        }
        
        console.log(`📦 Backing up collection '${collectionName}' (${count} documents)...`);
        
        const documents = await collection.find({}).toArray();
        const filePath = path.join(BACKUP_PATH, `${collectionName}.json`);
        
        fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
        
        console.log(`✅ Backed up ${count} documents from '${collectionName}'`);
        return { collection: collectionName, count, status: 'success', file: filePath };
        
    } catch (error) {
        console.error(`❌ Error backing up collection '${collectionName}':`, error.message);
        return { collection: collectionName, count: 0, status: 'error', error: error.message };
    }
}

/**
 * Create backup metadata file
 */
function createMetadata(results) {
    const metadata = {
        backupDate: new Date().toISOString(),
        timestamp: TIMESTAMP,
        databaseName: mongoose.connection.name,
        mongodbUri: process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'), // Hide password
        collections: results,
        totalDocuments: results.reduce((sum, r) => sum + r.count, 0),
        backupPath: BACKUP_PATH
    };
    
    const metadataPath = path.join(BACKUP_PATH, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    console.log(`\n📋 Backup Metadata:`);
    console.log(`   Database: ${metadata.databaseName}`);
    console.log(`   Total Documents: ${metadata.totalDocuments}`);
    console.log(`   Backup Location: ${BACKUP_PATH}`);
    
    return metadata;
}

/**
 * Main backup function
 */
async function performBackup() {
    console.log('🚀 Starting MongoDB Database Backup...\n');
    
    try {
        // Create backup directory
        createBackupDirectory();
        
        // Connect to MongoDB
        console.log('🔌 Connecting to MongoDB...');
        const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';
        
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });
        
        console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}\n`);
        
        // Get all collections in the database
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        console.log(`📚 Found ${collectionNames.length} collections in database\n`);
        
        // Backup each collection
        const results = [];
        for (const collectionName of collectionNames) {
            const result = await backupCollection(collectionName);
            results.push(result);
        }
        
        // Create metadata file
        const metadata = createMetadata(results);
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('✅ BACKUP COMPLETED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`📁 Backup Location: ${BACKUP_PATH}`);
        console.log(`📊 Collections Backed Up: ${results.filter(r => r.status === 'success').length}`);
        console.log(`📄 Total Documents: ${metadata.totalDocuments}`);
        console.log(`⏰ Timestamp: ${TIMESTAMP}`);
        console.log('='.repeat(60) + '\n');
        
        // Close connection
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
        
        return metadata;
        
    } catch (error) {
        console.error('\n❌ BACKUP FAILED:', error.message);
        console.error(error.stack);
        
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        
        process.exit(1);
    }
}

// Run backup if executed directly
if (require.main === module) {
    performBackup()
        .then(() => {
            console.log('✅ Backup script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Backup script failed:', error);
            process.exit(1);
        });
}

module.exports = { performBackup, BACKUP_PATH, BACKUP_DIR };
