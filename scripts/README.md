# Database Migration Scripts

This directory contains scripts for backing up, restoring, and migrating the attendance system database.

## Files Overview

### Backup & Restore Scripts
- **`backup-database.js`** - Creates complete MongoDB database backups
- **`restore-database.js`** - Restores database from backup files
- **`BACKUP_DOCUMENTATION.md`** - Comprehensive backup system documentation
- **`BACKUP_QUICK_REFERENCE.md`** - Quick reference guide for common tasks

### Migration Scripts
- **`migrate-to-period-based.js`** - Main migration script (Task 1.10) ✅
- **`verify-indexes.js`** - Index verification script (Task 1.9) ✅
- **`drop-attendance-session.js`** - Drop AttendanceSession collection (Task 1.8) ✅
- **`MIGRATION_GUIDE.md`** - Comprehensive migration documentation ✅
- **`MIGRATION_QUICK_START.md`** - Quick start guide for migration ✅

## Quick Start

### Option A: Run Complete Migration (Recommended)

```bash
# 1. Test migration (dry run)
node scripts/migrate-to-period-based.js --dry-run

# 2. Run migration (creates backup automatically)
node scripts/migrate-to-period-based.js

# 3. Restart your application server
```

See `MIGRATION_QUICK_START.md` for details.

### Option B: Manual Backup & Restore

#### 1. Create a Backup

Before any migration or major changes:

```bash
# Windows
..\BACKUP_DATABASE.bat

# Linux/Mac/Command Line
node backup-database.js
```

#### 2. Verify Backup

Check that backup was created successfully:

```bash
# List backups
ls ../backups/

# Check backup contents
ls ../backups/backup_YYYY-MM-DD_HH-MM-SS/
```

#### 3. Restore if Needed

If something goes wrong:

```bash
node restore-database.js backup_YYYY-MM-DD_HH-MM-SS
```

## Backup System Features

✅ **Complete Database Backup**
- Backs up all collections
- Preserves all documents
- Includes metadata

✅ **Safe Restore**
- Validates backup before restore
- Shows warnings before data replacement
- Verifies database connection

✅ **Detailed Logging**
- Shows progress for each collection
- Reports success/failure status
- Provides summary statistics

✅ **Error Handling**
- Graceful error recovery
- Detailed error messages
- Connection management

## Directory Structure

```
scripts/
├── backup-database.js              # Backup script
├── restore-database.js             # Restore script
├── migrate-to-period-based.js      # Main migration script ✅
├── verify-indexes.js               # Index verification ✅
├── drop-attendance-session.js      # Drop sessions collection ✅
├── BACKUP_DOCUMENTATION.md         # Full backup docs
├── BACKUP_QUICK_REFERENCE.md       # Backup quick reference
├── MIGRATION_GUIDE.md              # Full migration guide ✅
├── MIGRATION_QUICK_START.md        # Migration quick start ✅
└── README.md                       # This file

backups/                            # Backup storage (not in git)
├── .gitkeep                        # Preserves directory in git
└── backup_YYYY-MM-DD_HH-MM-SS/     # Timestamped backups
    ├── metadata.json               # Backup information
    ├── studentmanagements.json     # Collection data
    ├── teachers.json
    ├── timetables.json
    └── ...

migration-report.json               # Generated after migration ✅
```

## Environment Requirements

### Required Environment Variables

Create a `.env` file in the project root:

```env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/attendance_app
```

### Required Dependencies

All dependencies are already installed in the project:
- `mongoose` - MongoDB ODM
- `dotenv` - Environment variable management
- `fs` - File system operations (built-in)
- `path` - Path utilities (built-in)

## Usage Examples

### Example 1: Complete Migration (Recommended)

```bash
# Step 1: Test migration (dry run)
node scripts/migrate-to-period-based.js --dry-run

# Review output to see what will happen

# Step 2: Run migration
node scripts/migrate-to-period-based.js

# Migration automatically:
# - Creates backup
# - Removes timer fields
# - Drops AttendanceSession
# - Creates indexes
# - Seeds settings
# - Verifies success

# Step 3: Check migration report
cat migration-report.json

# Step 4: Restart application server
# Your server will now use period-based attendance

# Step 5: If issues occur, rollback
node scripts/restore-database.js backup_YYYY-MM-DD_HH-MM-SS
```

### Example 2: Pre-Migration Backup

```bash
# Step 1: Create backup
node scripts/backup-database.js

# Output shows backup location:
# ✅ Backup Location: backups/backup_2024-01-15_14-30-00

# Step 2: Note the backup folder name
# backup_2024-01-15_14-30-00

# Step 3: Run migration (when ready)
# node scripts/migrate-to-period-based.js

# Step 4: If issues occur, restore
# node scripts/restore-database.js backup_2024-01-15_14-30-00
```

### Example 3: Verify Migration Success

```bash
# After migration, verify indexes
node scripts/verify-indexes.js

# Check system settings
node -e "
const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const settings = await mongoose.connection.db.collection('systemsettings').findOne({settingKey: 'daily_threshold'});
  console.log('Daily Threshold:', settings.settingValue);
  process.exit(0);
});
"
```

### Example 4: Testing Restore

```bash
# Create a test backup
node scripts/backup-database.js

# Make some test changes to database
# (add/delete records via admin panel)

# Restore from backup
node scripts/restore-database.js backup_2024-01-15_14-30-00

# Verify data is restored correctly
```

### Example 5: Scheduled Backups

**Linux/Mac (crontab):**
```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/project && node scripts/backup-database.js >> logs/backup.log 2>&1
```

**Windows (Task Scheduler):**
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
   - Program: `node`
   - Arguments: `scripts\backup-database.js`
   - Start in: `C:\path\to\project`

## Troubleshooting

### Common Issues

**Issue: "Cannot connect to MongoDB"**
```bash
# Check .env file exists
cat .env | grep MONGODB_URI

# Test connection
node check-students.js
```

**Issue: "Backup directory not found"**
```bash
# Create backups directory
mkdir backups

# Run backup again
node scripts/backup-database.js
```

**Issue: "Out of disk space"**
```bash
# Check disk space
df -h

# Delete old backups
rm -rf backups/backup_OLD_DATE_*
```

## Best Practices

1. ✅ **Always backup before migration**
2. ✅ **Test restore on staging first**
3. ✅ **Keep multiple backup copies**
4. ✅ **Document backup locations**
5. ✅ **Monitor disk space**
6. ✅ **Automate regular backups**
7. ✅ **Verify backups periodically**
8. ✅ **Secure backup files**

## Security Notes

⚠️ **Important Security Considerations:**

1. **Backup files contain sensitive data**
   - Student personal information
   - Teacher records
   - Face embeddings (encrypted)
   - Attendance records

2. **Protect backup files**
   - Store in secure location
   - Restrict file permissions
   - Encrypt if storing remotely
   - Don't commit to git (already in .gitignore)

3. **Connection strings**
   - Metadata file hides passwords
   - Never share backup metadata publicly
   - Use environment variables for credentials

## Support & Documentation

### Migration Documentation
- **Quick Start**: `MIGRATION_QUICK_START.md` - 3-step migration guide
- **Full Guide**: `MIGRATION_GUIDE.md` - Comprehensive migration documentation
- **Spec Tasks**: `../.kiro/specs/period-based-attendance-system/tasks.md`
- **Design Document**: `../.kiro/specs/period-based-attendance-system/design.md`

### Backup Documentation
- **Quick Reference**: `BACKUP_QUICK_REFERENCE.md`
- **Full Documentation**: `BACKUP_DOCUMENTATION.md`

## Version History

- **v1.1** (2024-01-15): Migration system completed ✅
  - Complete migration script with rollback
  - Dry-run mode for testing
  - Comprehensive migration guide
  - Quick start documentation
  - Automated backup creation
  - Index verification
  - Migration report generation

- **v1.0** (2024-01-15): Initial backup and restore system
  - Complete database backup
  - Safe restore with warnings
  - Comprehensive documentation
  - Windows batch file support

## Next Steps

✅ **Task 1.10 Complete**: Migration script created and tested

The migration system is ready to use. To migrate your database:

1. Read `MIGRATION_QUICK_START.md`
2. Run dry-run: `node scripts/migrate-to-period-based.js --dry-run`
3. Run migration: `node scripts/migrate-to-period-based.js`
4. Restart your application server

Next tasks in the spec:
- **Phase 2**: Backend API development (Tasks 2.1-7.5)
- **Phase 3**: Frontend updates (Tasks 8.1+)
