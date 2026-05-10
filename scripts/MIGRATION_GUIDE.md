# Period-Based Attendance System Migration Guide

## Overview

This guide provides comprehensive instructions for migrating from the timer-based attendance system to the new period-based attendance system using the `migrate-to-period-based.js` script.

## Prerequisites

### Before Running Migration

1. **Backup Verification**
   - Ensure you have a recent backup of your database
   - Test backup restoration process
   - Document backup location

2. **Environment Setup**
   - Node.js 14+ installed
   - MongoDB connection string configured in `.env`
   - All dependencies installed (`npm install`)

3. **System Requirements**
   - Sufficient disk space for backup (estimate: 2x current database size)
   - Database write permissions
   - Network connectivity to MongoDB server

4. **Downtime Planning**
   - Schedule migration during low-usage period
   - Notify users of expected downtime
   - Prepare rollback plan

## Migration Script

### Location
```
scripts/migrate-to-period-based.js
```

### Usage

#### Standard Migration (Recommended)
```bash
node scripts/migrate-to-period-based.js
```

#### Dry Run (Test Mode)
```bash
node scripts/migrate-to-period-based.js --dry-run
```
- Shows what would be done without making changes
- Use this to preview migration steps
- Recommended before production migration

#### Skip Backup (NOT RECOMMENDED)
```bash
node scripts/migrate-to-period-based.js --skip-backup
```
- Skips automatic backup creation
- Only use if you have a recent manual backup
- NOT recommended for production

## Migration Steps

The script executes the following steps in order:

### Step 0: Pre-migration Checks
- Verifies MongoDB connection
- Checks backup directory exists
- Lists existing backups

### Step 1: Create Database Backup
- Creates timestamped backup of entire database
- Exports all collections to JSON files
- Generates backup metadata
- **Location**: `backups/backup_YYYY-MM-DD_HH-MM-SS/`

### Step 2: Verify New Schemas
- Checks if new collections exist
- Lists existing and missing collections
- Confirms schema definitions in server.js

**New Collections**:
- `periodattendances` - Period-level attendance records
- `dailyattendances` - Daily attendance aggregation
- `attendanceaudits` - Audit trail for all changes
- `systemsettings` - System configuration

### Step 3: Remove Timer Fields from StudentManagement
- Removes: `timerValue`, `isRunning`, `isPaused`, `attendanceSession`
- Updates all student documents
- Preserves all other student data

### Step 4: Remove Timer Fields from RandomRing
- Removes: `timeBeforeRandomRing`, `timerCutoff`
- Updates all random ring documents
- Preserves verification functionality

### Step 5: Drop AttendanceSession Collection
- **DESTRUCTIVE**: Permanently deletes timer-based session data
- No migration of old data (fresh start approach)
- Frees up database storage

### Step 6: Create Indexes
- Creates performance indexes for new collections
- Compound indexes for fast queries
- Unique constraints where needed

**Indexes Created**:
- PeriodAttendance: 4 indexes (including compound unique)
- DailyAttendance: 4 indexes
- AttendanceAudit: 4 indexes (including unique auditId)
- SystemSettings: 1 index (unique settingKey)

### Step 7: Seed Default System Settings
- Creates `daily_threshold` setting = 75%
- Sets up system configuration
- Skips if setting already exists

### Step 8: Verify Migration Success
- Verifies all collections exist or will be created
- Confirms AttendanceSession is dropped
- Checks indexes are created
- Validates system settings

## Migration Report

After migration, a detailed report is generated:

### Report Location
```
migration-report.json
```

### Report Contents
- Start and end timestamps
- Duration in seconds
- Status of each migration step
- Success/error/skipped counts
- Backup location
- Error details (if any)

### Console Output
The script provides color-coded console output:
- 🟢 Green: Success
- 🔴 Red: Error
- 🟡 Yellow: Warning/Skipped
- 🔵 Blue: Information

## Rollback Procedure

If migration fails or issues are discovered:

### Automatic Rollback Instructions
The script provides rollback commands in the output:
```bash
node scripts/restore-database.js backup_YYYY-MM-DD_HH-MM-SS
```

### Manual Rollback Steps

1. **Stop Application Server**
   ```bash
   # Stop your Node.js server
   ```

2. **Restore Database**
   ```bash
   node scripts/restore-database.js <backup-folder-name>
   ```

3. **Verify Restoration**
   - Check collection counts
   - Verify data integrity
   - Test application functionality

4. **Restart Application**
   ```bash
   # Start your Node.js server
   ```

## Post-Migration Tasks

### Immediate Tasks (Within 1 Hour)

1. **Restart Application Server**
   ```bash
   # Restart your Node.js server to load new schemas
   ```

2. **Verify Application Startup**
   - Check server logs for errors
   - Confirm MongoDB connection
   - Verify schema loading

3. **Test Core Functionality**
   - Student check-in
   - Random ring trigger
   - Manual attendance marking
   - Report generation

### Short-term Tasks (Within 24 Hours)

1. **Monitor System Performance**
   - Database query performance
   - Index utilization
   - Error rates

2. **User Acceptance Testing**
   - Student app check-in flow
   - Teacher app random rings
   - Admin panel reports

3. **Data Validation**
   - Verify attendance records are created correctly
   - Check daily threshold calculations
   - Confirm audit trail logging

### Long-term Tasks (Within 7 Days)

1. **Performance Optimization**
   - Review slow queries
   - Optimize indexes if needed
   - Monitor database growth

2. **Backup Retention**
   - Keep migration backup for at least 7 days
   - Archive old backups
   - Document backup location

3. **Documentation Updates**
   - Update user guides
   - Update API documentation
   - Update deployment procedures

## Troubleshooting

### Common Issues

#### Issue: "MongoDB connection failed"
**Solution**:
- Check `.env` file has correct `MONGODB_URI`
- Verify MongoDB server is running
- Check network connectivity
- Verify credentials

#### Issue: "Backup directory not writable"
**Solution**:
- Check file system permissions
- Ensure sufficient disk space
- Create `backups/` directory manually

#### Issue: "Collection already exists"
**Solution**:
- This is normal if data was already inserted
- Migration will skip collection creation
- Indexes will still be created

#### Issue: "Index creation failed"
**Solution**:
- Check for duplicate data violating unique constraints
- Drop existing indexes manually if needed
- Re-run migration

#### Issue: "AttendanceSession not found"
**Solution**:
- This is normal if collection was already dropped
- Migration will skip this step
- No action needed

### Error Recovery

#### If Migration Fails Mid-way

1. **Review Error Messages**
   - Check console output for specific error
   - Review `migration-report.json`

2. **Assess Database State**
   ```bash
   # Connect to MongoDB and check collections
   mongo <connection-string>
   > show collections
   > db.studentmanagements.findOne()
   ```

3. **Decide on Action**
   - **Option A**: Fix issue and re-run migration
   - **Option B**: Rollback and investigate

4. **Re-run Migration**
   - Migration is idempotent (safe to re-run)
   - Already completed steps will be skipped
   - Only failed steps will be retried

## Testing Checklist

### Pre-Migration Testing

- [ ] Dry run completed successfully
- [ ] Backup tested and verified
- [ ] Rollback procedure tested
- [ ] Downtime window scheduled
- [ ] Users notified

### Post-Migration Testing

- [ ] Application starts without errors
- [ ] Database connection successful
- [ ] New collections created
- [ ] Indexes created correctly
- [ ] System settings seeded
- [ ] Student check-in works
- [ ] Random ring works
- [ ] Manual marking works
- [ ] Reports generate correctly
- [ ] Audit trail logging works

## Support

### Getting Help

1. **Review Documentation**
   - This migration guide
   - `scripts/README.md`
   - Design document: `.kiro/specs/period-based-attendance-system/design.md`

2. **Check Logs**
   - Console output from migration script
   - `migration-report.json`
   - Application server logs

3. **Database Inspection**
   - Use MongoDB Compass or CLI
   - Check collection structures
   - Verify data integrity

## Best Practices

### Before Migration

1. **Test in Staging First**
   - Run migration on staging environment
   - Verify all functionality
   - Document any issues

2. **Create Manual Backup**
   - In addition to automatic backup
   - Store in separate location
   - Test restoration

3. **Document Current State**
   - Collection counts
   - Index list
   - Sample documents

### During Migration

1. **Monitor Progress**
   - Watch console output
   - Check for errors
   - Note any warnings

2. **Don't Interrupt**
   - Let migration complete
   - Don't stop the process
   - Wait for final report

### After Migration

1. **Keep Backup**
   - Don't delete for at least 7 days
   - Archive for compliance
   - Document location

2. **Monitor Performance**
   - Watch query times
   - Check error rates
   - Review user feedback

3. **Update Documentation**
   - Record migration date
   - Note any issues
   - Update procedures

## Appendix

### File Locations

```
scripts/
├── migrate-to-period-based.js    # Main migration script
├── backup-database.js            # Backup utility
├── restore-database.js           # Restore utility
├── verify-indexes.js             # Index verification
├── MIGRATION_GUIDE.md            # This guide
└── README.md                     # Scripts overview

backups/
└── backup_YYYY-MM-DD_HH-MM-SS/   # Timestamped backups
    ├── metadata.json
    ├── studentmanagements.json
    ├── teachers.json
    └── ...

migration-report.json              # Migration execution report
```

### Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/attendance_app
```

### Dependencies

```json
{
  "mongoose": "^6.0.0",
  "dotenv": "^16.0.0"
}
```

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
**Author**: Period-Based Attendance System Migration Team
