# Database Backup and Restore Documentation

## Overview

This document describes the database backup and restore system for the Period-Based Attendance System migration. The backup system creates complete snapshots of the MongoDB database before schema changes.

## Files

- `backup-database.js` - Creates database backups
- `restore-database.js` - Restores database from backups
- `BACKUP_DOCUMENTATION.md` - This documentation file

## Backup Location

All backups are stored in the `backups/` directory at the project root:

```
project-root/
├── backups/
│   ├── backup_2024-01-15_14-30-00/
│   │   ├── metadata.json
│   │   ├── studentmanagements.json
│   │   ├── teachers.json
│   │   ├── timetables.json
│   │   ├── attendancerecords.json
│   │   ├── attendancesessions.json
│   │   └── ...
│   └── backup_2024-01-16_09-15-30/
│       └── ...
└── scripts/
    ├── backup-database.js
    ├── restore-database.js
    └── BACKUP_DOCUMENTATION.md
```

## Backup Retention Policy

### Recommended Retention Schedule

1. **Pre-Migration Backup**: Keep indefinitely (critical rollback point)
2. **Daily Backups**: Keep for 7 days
3. **Weekly Backups**: Keep for 4 weeks
4. **Monthly Backups**: Keep for 12 months

### Storage Considerations

- Each backup contains all collections in JSON format
- Typical backup size: 10-500 MB depending on data volume
- Ensure sufficient disk space (recommend 5GB minimum)

### Automated Cleanup

To implement automated cleanup, add a cron job or scheduled task:

```bash
# Delete backups older than 7 days (except pre-migration backup)
find ./backups -name "backup_*" -type d -mtime +7 -exec rm -rf {} \;
```

## Usage

### Creating a Backup

**Before running the migration**, create a backup:

```bash
node scripts/backup-database.js
```

**Output:**
```
🚀 Starting MongoDB Database Backup...

✅ Created backup directory: /path/to/backups
✅ Created backup path: /path/to/backups/backup_2024-01-15_14-30-00
🔌 Connecting to MongoDB...
✅ Connected to MongoDB: attendance_app

📚 Found 8 collections in database

📦 Backing up collection 'studentmanagements' (150 documents)...
✅ Backed up 150 documents from 'studentmanagements'
📦 Backing up collection 'teachers' (25 documents)...
✅ Backed up 25 documents from 'teachers'
...

============================================================
✅ BACKUP COMPLETED SUCCESSFULLY
============================================================
📁 Backup Location: /path/to/backups/backup_2024-01-15_14-30-00
📊 Collections Backed Up: 8
📄 Total Documents: 1,250
⏰ Timestamp: 2024-01-15_14-30-00
============================================================
```

### Listing Available Backups

```bash
ls -la backups/
```

Or use the restore script without arguments:

```bash
node scripts/restore-database.js
```

**Output:**
```
❌ Error: Please provide backup folder name

Usage: node scripts/restore-database.js <backup-folder-name>
Example: node scripts/restore-database.js backup_2024-01-15_14-30-00

Available backups:
  - backup_2024-01-15_14-30-00
  - backup_2024-01-16_09-15-30
```

### Restoring from Backup

**WARNING**: Restore will **replace all data** in the current database!

```bash
node scripts/restore-database.js backup_2024-01-15_14-30-00
```

**Output:**
```
🚀 Starting MongoDB Database Restore...

✅ Found backup directory: /path/to/backups/backup_2024-01-15_14-30-00

📋 Backup Metadata:
   Backup Date: 2024-01-15T14:30:00.000Z
   Database: attendance_app
   Total Documents: 1,250
   Collections: 8

🔌 Connecting to MongoDB...
✅ Connected to MongoDB: attendance_app

⚠️  WARNING: This will replace all data in the current database!
   Current Database: attendance_app
   Backup Database: attendance_app

📚 Found 8 collection backups to restore

📦 Restoring collection 'studentmanagements' (150 documents)...
✅ Restored 150 documents to 'studentmanagements'
...

============================================================
✅ RESTORE COMPLETED SUCCESSFULLY
============================================================
📊 Collections Restored: 8
📄 Total Documents: 1,250
📁 Backup Source: /path/to/backups/backup_2024-01-15_14-30-00
============================================================
```

## Backup Contents

### Metadata File (metadata.json)

Each backup includes a metadata file with:

```json
{
  "backupDate": "2024-01-15T14:30:00.000Z",
  "timestamp": "2024-01-15_14-30-00",
  "databaseName": "attendance_app",
  "mongodbUri": "mongodb+srv://user:****@cluster.mongodb.net/...",
  "collections": [
    {
      "collection": "studentmanagements",
      "count": 150,
      "status": "success",
      "file": "/path/to/backup/studentmanagements.json"
    }
  ],
  "totalDocuments": 1250,
  "backupPath": "/path/to/backups/backup_2024-01-15_14-30-00"
}
```

### Collection Files

Each collection is exported as a JSON array:

```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "enrollmentNo": "2021001",
    "name": "John Doe",
    "semester": "3",
    "branch": "B.Tech Computer Science",
    ...
  },
  ...
]
```

## Migration Workflow

### Step 1: Pre-Migration Backup

```bash
# Create backup before migration
node scripts/backup-database.js

# Note the backup folder name (e.g., backup_2024-01-15_14-30-00)
```

### Step 2: Run Migration

```bash
# Run the migration script (to be created in Task 1.10)
node scripts/migrate-to-period-based.js
```

### Step 3: Verify Migration

```bash
# Check database state
node scripts/verify-migration.js

# Test the application
npm start
```

### Step 4: Rollback (if needed)

If migration fails or issues are found:

```bash
# Restore from pre-migration backup
node scripts/restore-database.js backup_2024-01-15_14-30-00

# Verify restoration
node scripts/verify-migration.js
```

## Testing Backup and Restore

### Test Backup Creation

```bash
# Create a test backup
node scripts/backup-database.js

# Verify backup files exist
ls -la backups/backup_*/
```

### Test Restore Functionality

**WARNING**: Only test restore on a development/staging database!

```bash
# 1. Create a backup
node scripts/backup-database.js

# 2. Make some changes to the database (add/delete records)

# 3. Restore from backup
node scripts/restore-database.js backup_YYYY-MM-DD_HH-MM-SS

# 4. Verify data is restored correctly
```

## Troubleshooting

### Issue: "Cannot connect to MongoDB"

**Solution:**
- Check `.env` file has correct `MONGODB_URI`
- Verify network connectivity
- Check MongoDB Atlas IP whitelist

### Issue: "Backup directory not found"

**Solution:**
- Ensure `backups/` directory exists
- Check file permissions
- Verify backup folder name is correct

### Issue: "Out of disk space"

**Solution:**
- Delete old backups: `rm -rf backups/backup_OLD_DATE_*`
- Increase disk space
- Implement automated cleanup

### Issue: "Restore fails with duplicate key error"

**Solution:**
- The restore script clears existing data before inserting
- If error persists, manually drop collections:
  ```javascript
  // In MongoDB shell
  db.collectionName.drop()
  ```

## Security Considerations

### Backup Security

1. **Password Protection**: Backup files contain sensitive data
   - Store backups in secure location
   - Encrypt backup files if storing remotely
   - Restrict file permissions: `chmod 600 backups/*`

2. **Connection String**: Metadata file hides password
   - Original: `mongodb+srv://user:password@cluster...`
   - Stored: `mongodb+srv://user:****@cluster...`

3. **Access Control**:
   - Limit access to backup directory
   - Use separate backup user with read-only permissions

### Restore Security

1. **Verification**: Always verify backup metadata before restore
2. **Testing**: Test restore on staging environment first
3. **Confirmation**: Restore script shows warning before proceeding

## Environment Variables

Required environment variables (in `.env` file):

```env
# MongoDB Connection
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/attendance_app

# Optional: Backup Configuration
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=7
```

## Automated Backups

### Using Cron (Linux/Mac)

Add to crontab (`crontab -e`):

```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/project && node scripts/backup-database.js >> logs/backup.log 2>&1

# Weekly cleanup (delete backups older than 7 days)
0 3 * * 0 find /path/to/project/backups -name "backup_*" -type d -mtime +7 -exec rm -rf {} \;
```

### Using Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., Daily at 2:00 AM)
4. Action: Start a program
   - Program: `node`
   - Arguments: `scripts/backup-database.js`
   - Start in: `C:\path\to\project`

## Best Practices

1. **Always backup before migration**: Create backup immediately before running migration
2. **Test restore process**: Verify restore works on staging environment
3. **Keep multiple backups**: Don't rely on a single backup
4. **Document backup location**: Ensure team knows where backups are stored
5. **Monitor disk space**: Ensure sufficient space for backups
6. **Automate backups**: Set up scheduled backups for production
7. **Verify backups**: Periodically test restore process
8. **Secure backups**: Protect backup files from unauthorized access

## Support

For issues or questions:
1. Check this documentation
2. Review backup logs in console output
3. Check MongoDB connection status
4. Verify environment variables are set correctly

## Version History

- **v1.0** (2024-01-15): Initial backup and restore system
  - Basic backup functionality
  - Restore with data replacement
  - Metadata tracking
  - Documentation
