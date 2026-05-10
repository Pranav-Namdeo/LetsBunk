# AttendanceSession Collection Removal Documentation

## Overview

This document describes the removal of the `AttendanceSession` collection as part of the migration from timer-based to period-based attendance tracking.

## What is Being Removed

### Collection: `attendancesessions`

The AttendanceSession collection stored real-time timer-based attendance tracking data including:
- Session start times
- Timer values (seconds)
- Pause/resume states
- Grace period tracking
- WiFi connection events
- Random ring tracking
- Security audit trails

### Schema Definition

The following schema and model have been removed from `server.js`:
- `attendanceSessionSchema` (lines 281-342)
- `AttendanceSession` model
- Database indexes:
  - `{ studentId: 1, date: -1 }`
  - `{ date: -1, isActive: 1 }`

## Data Loss Impact

### ⚠️ CRITICAL: No Data Migration

**This is a DESTRUCTIVE operation with NO rollback capability.**

All timer-based attendance session data will be **permanently deleted**, including:
- Historical timer sessions
- Pause/resume history
- WiFi connection events
- Grace period usage
- Security audit trails

### Why No Migration?

Per Requirements 9.8:
> "THE Backend_Server SHALL NOT migrate existing timer-based attendance data to the new schema (fresh start)"

The new period-based system is fundamentally incompatible with timer-based data:
- Timer sessions track continuous seconds
- Period attendance tracks discrete present/absent status
- No meaningful conversion exists between the two models

## Dependencies Verified

### No Direct Collection Dependencies

The AttendanceSession collection is **standalone** and not referenced by other collections through foreign keys or relationships.

### Code Dependencies (To Be Removed in Later Tasks)

The following code still references AttendanceSession and will be removed in subsequent tasks:

1. **API Endpoints** (Task 2.1):
   - `/api/attendance/start-unified-timer`
   - `/api/attendance/stop-unified-timer`
   - `/api/attendance/pause-unified-timer`
   - `/api/attendance/resume-unified-timer`
   - `/api/attendance/update-timer`
   - `/api/attendance/get-timer-state`

2. **Helper Functions** (Task 2.3):
   - `calculateAttendedTime()`
   - Timer calculation logic
   - Grace period management

3. **StudentManagement References** (Task 1.6):
   - `student.attendanceSession` field references
   - These reference embedded documents, not the AttendanceSession collection

## Backup Strategy

### Before Running Drop Script

**REQUIRED**: Create database backup
```bash
node scripts/backup-database.js
```

This creates a timestamped backup in `backups/` directory including:
- All collections (including attendancesessions)
- Complete data snapshot
- Restoration capability

### Backup Location

```
backups/
└── backup_YYYYMMDD_HHMMSS/
    ├── attendancesessions.json  ← Timer session data
    ├── studentmanagements.json
    ├── attendancerecords.json
    └── ...
```

## Execution Steps

### 1. Create Backup (REQUIRED)

```bash
node scripts/backup-database.js
```

Verify backup exists:
```bash
dir backups
```

### 2. Run Drop Script

```bash
node scripts/drop-attendance-session.js
```

The script will:
1. Connect to MongoDB
2. Verify no dependencies
3. Display collection statistics
4. Drop the collection
5. Report deleted data count

### 3. Verify Removal

Check that collection no longer exists:
```bash
# In MongoDB shell or Compass
show collections
# attendancesessions should NOT appear
```

## Rollback Procedure

### If Drop Was Accidental

1. Stop the server immediately
2. Restore from backup:
   ```bash
   node scripts/restore-database.js
   ```
3. Select the most recent backup
4. Restore attendancesessions collection

### Limitations

- Only data in the backup can be restored
- Any data created after backup is lost
- Restoration requires server downtime

## Post-Removal Tasks

After dropping the AttendanceSession collection, the following tasks must be completed:

### Phase 1: Remaining Schema Tasks
- [x] Task 1.8: Delete AttendanceSession collection ← **CURRENT**
- [ ] Task 1.9: Create database indexes for new collections
- [ ] Task 1.10: Create migration script

### Phase 2: Code Removal
- [ ] Task 2.1: Remove timer API endpoints
- [ ] Task 2.2: Remove timer socket handlers
- [ ] Task 2.3: Remove timer calculation logic

### Phase 3: Frontend Updates
- [ ] Task 8.1-8.4: Remove timer UI components

## Verification Checklist

After running the drop script:

- [ ] Collection `attendancesessions` no longer exists
- [ ] Backup file exists in `backups/` directory
- [ ] Server.js has AttendanceSession schema removed
- [ ] Server.js has AttendanceSession indexes removed
- [ ] Documentation updated
- [ ] Team notified of data loss

## Notes

### Fresh Start Approach

The period-based system represents a **fresh start** for attendance tracking:
- No historical timer data carries over
- Students start with clean attendance records
- New period-based records begin from migration date

### Communication

**Important**: Notify all stakeholders:
- Students: Historical timer data will not be visible
- Teachers: Past attendance reports use old system
- Admins: New reports start from migration date

### Timeline

- **Before Migration**: Timer-based system active
- **Migration Day**: Drop AttendanceSession collection
- **After Migration**: Period-based system active
- **Transition Period**: Both old and new reports available (old data in backup)

## References

- Requirements Document: Section 9 (Database Schema Migration)
- Design Document: Data Models section
- Tasks Document: Phase 1, Task 1.8

## Script Location

- Drop script: `scripts/drop-attendance-session.js`
- Backup script: `scripts/backup-database.js`
- Restore script: `scripts/restore-database.js`

---

**Last Updated**: Task 1.8 Execution
**Status**: Schema and indexes removed from server.js, collection drop script created
