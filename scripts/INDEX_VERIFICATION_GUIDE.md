# Database Index Verification Guide

## Overview

This guide explains how to verify that all required database indexes are properly created for the period-based attendance system collections.

## Collections with Indexes

### 1. PeriodAttendance Collection

**Purpose**: Store attendance status for each student, period, and date

**Indexes**:
- `{ enrollmentNo: 1, date: 1, period: 1 }` - **UNIQUE** compound index
  - Used for: Fast lookups of specific student attendance for a period
  - Ensures: No duplicate attendance records for same student/date/period
  
- `{ date: 1 }` - Date index
  - Used for: Daily attendance queries across all students
  
- `{ teacher: 1, date: 1 }` - Teacher-date compound index
  - Used for: Teacher viewing their class attendance
  
- `{ status: 1, date: 1 }` - Status-date compound index
  - Used for: Filtering by attendance status (present/absent)

### 2. DailyAttendance Collection

**Purpose**: Aggregated daily attendance status per student

**Indexes**:
- `{ enrollmentNo: 1, date: -1 }` - Student-date compound index (descending date)
  - Used for: Student viewing their attendance history
  
- `{ date: -1 }` - Date index (descending)
  - Used for: Daily reports sorted by most recent first
  
- `{ semester: 1, branch: 1, date: -1 }` - Semester-branch-date compound index
  - Used for: Branch-wise attendance reports
  
- `{ dailyStatus: 1, date: -1 }` - Status-date compound index
  - Used for: Filtering by daily status (present/absent)

### 3. AttendanceAudit Collection

**Purpose**: Maintain complete audit trail for all attendance modifications

**Indexes**:
- `{ auditId: 1 }` - **UNIQUE** audit ID index
  - Used for: Direct audit record lookup
  - Ensures: Unique audit identifiers
  
- `{ enrollmentNo: 1, date: -1 }` - Student-date compound index
  - Used for: Student audit history
  
- `{ modifiedBy: 1, modifiedAt: -1 }` - Modifier-timestamp compound index
  - Used for: Tracking who made changes and when
  
- `{ recordId: 1 }` - Record reference index
  - Used for: Finding all audit entries for a specific attendance record

### 4. SystemSettings Collection

**Purpose**: Store system-wide configuration settings

**Indexes**:
- `{ settingKey: 1 }` - **UNIQUE** setting key index
  - Used for: Fast configuration lookup
  - Ensures: No duplicate setting keys

## Verification Script

### Running the Verification

**Option 1: Using Batch File (Windows)**
```bash
VERIFY_INDEXES.bat
```

**Option 2: Using Node.js Directly**
```bash
node scripts/verify-indexes.js
```

### What the Script Does

1. **Connects to MongoDB** using the connection string from `.env`

2. **Verifies Index Definitions** for each collection:
   - Checks if collection exists
   - Lists all actual indexes in the database
   - Compares against expected indexes
   - Validates unique constraints

3. **Tests Query Performance** using MongoDB's `explain()`:
   - Verifies indexes are being used by queries
   - Measures execution time
   - Counts documents examined
   - Only runs if collections have data

4. **Generates Report** showing:
   - ✓ PASS - All indexes found and correct
   - ✗ FAIL - Missing or incorrect indexes
   - ⚠️ WARNING - Collection doesn't exist yet (expected during migration)

### Expected Output

#### During Migration (No Data Yet)
```
============================================================
Verifying indexes for: periodattendances
============================================================

⚠️  Collection does not exist yet (no data inserted)
   Indexes will be created automatically when first document is inserted
   Expected indexes are defined in the schema
```

This is **NORMAL** and **EXPECTED** during the migration phase. Indexes are defined in the Mongoose schemas and will be created automatically when the first document is inserted.

#### After Data Insertion
```
============================================================
Verifying indexes for: periodattendances
============================================================

Found 5 indexes:
  ✓ _id_
    Keys: {"_id":1}
  ✓ enrollmentNo_1_date_1_period_1 [UNIQUE]
    Keys: {"enrollmentNo":1,"date":1,"period":1}
  ✓ date_1
    Keys: {"date":1}
  ✓ teacher_1_date_1
    Keys: {"teacher":1,"date":1}
  ✓ status_1_date_1
    Keys: {"status":1,"date":1}

Expected 5 indexes:
  ✓ _id_ - FOUND
  ✓ enrollmentNo_1_date_1_period_1 [UNIQUE] - FOUND
  ✓ date_1 - FOUND
  ✓ teacher_1_date_1 - FOUND
  ✓ status_1_date_1 - FOUND
```

## Index Creation Process

### Automatic Creation

Indexes are **automatically created** by Mongoose when:
1. The server starts and connects to MongoDB
2. The first document is inserted into a collection
3. Mongoose calls `ensureIndexes()` on the model

### Manual Creation (If Needed)

If indexes need to be manually created or rebuilt:

```javascript
// In MongoDB shell or script
db.periodattendances.createIndex({ enrollmentNo: 1, date: 1, period: 1 }, { unique: true });
db.periodattendances.createIndex({ date: 1 });
db.periodattendances.createIndex({ teacher: 1, date: 1 });
db.periodattendances.createIndex({ status: 1, date: 1 });

db.dailyattendances.createIndex({ enrollmentNo: 1, date: -1 });
db.dailyattendances.createIndex({ date: -1 });
db.dailyattendances.createIndex({ semester: 1, branch: 1, date: -1 });
db.dailyattendances.createIndex({ dailyStatus: 1, date: -1 });

db.attendanceaudits.createIndex({ auditId: 1 }, { unique: true });
db.attendanceaudits.createIndex({ enrollmentNo: 1, date: -1 });
db.attendanceaudits.createIndex({ modifiedBy: 1, modifiedAt: -1 });
db.attendanceaudits.createIndex({ recordId: 1 });

db.systemsettings.createIndex({ settingKey: 1 }, { unique: true });
```

## Performance Monitoring

### Query Performance Tests

The verification script includes performance tests that use MongoDB's `explain()` to verify:

1. **Index Usage**: Confirms queries are using the correct indexes
2. **Execution Time**: Measures query performance in milliseconds
3. **Documents Examined**: Ensures efficient queries (low doc examination)

### Example Performance Test Output

```
1. PeriodAttendance - Compound index query (enrollmentNo, date, period):
   Query Plan: FETCH
   Index Used: enrollmentNo_1_date_1_period_1
   Docs Examined: 1
   Execution Time: 2ms
```

**Good Performance Indicators**:
- Index is being used (not "NONE")
- Low number of documents examined
- Fast execution time (< 10ms for simple queries)

**Poor Performance Indicators**:
- Index Used: NONE (collection scan)
- High documents examined relative to results
- Slow execution time (> 100ms)

## Troubleshooting

### Issue: Collection doesn't exist

**Symptom**: `ns does not exist: attendance_app.periodattendances`

**Solution**: This is normal during migration. Collections are created when first document is inserted. Indexes are defined in schemas and will be created automatically.

### Issue: Index not found

**Symptom**: `✗ enrollmentNo_1_date_1_period_1 - MISSING`

**Solution**:
1. Check if schema definition includes the index
2. Restart the server to trigger index creation
3. Manually create the index using MongoDB shell
4. Check for index creation errors in server logs

### Issue: Unique constraint violation

**Symptom**: `E11000 duplicate key error`

**Solution**:
1. Check for duplicate data in the collection
2. Remove duplicates before creating unique index
3. Verify application logic prevents duplicates

### Issue: Slow query performance

**Symptom**: High execution time or documents examined

**Solution**:
1. Verify correct index is being used
2. Check if index covers all query fields
3. Consider adding compound indexes for common queries
4. Analyze query patterns and optimize indexes

## Maintenance

### Regular Verification

Run the verification script:
- After server deployment
- After schema changes
- When experiencing performance issues
- As part of regular maintenance

### Index Monitoring

Monitor index usage in production:
```javascript
// Check index statistics
db.periodattendances.aggregate([{ $indexStats: {} }])
```

### Index Rebuilding

If indexes become fragmented or corrupted:
```javascript
// Rebuild all indexes
db.periodattendances.reIndex()
```

## Requirements Mapping

This task implements **Requirement 9: Database Schema Migration**:

**Acceptance Criteria 4**: "THE Backend_Server SHALL create an index on PeriodAttendance collection for fields: enrollmentNo, date, period (compound index)"
- ✓ Implemented in `periodAttendanceSchema.index({ enrollmentNo: 1, date: 1, period: 1 }, { unique: true })`

**Acceptance Criteria 5**: "THE Backend_Server SHALL create an index on PeriodAttendance collection for field: date (for daily queries)"
- ✓ Implemented in `periodAttendanceSchema.index({ date: 1 })`

**Additional indexes** created for performance optimization:
- Teacher-date compound index for teacher queries
- Status-date compound index for filtering
- All DailyAttendance indexes for reporting
- All AttendanceAudit indexes for audit trail
- SystemSettings unique index for configuration

## Summary

✓ All required indexes are defined in Mongoose schemas
✓ Indexes will be created automatically when collections are used
✓ Verification script confirms index definitions
✓ Performance tests validate index usage
✓ Documentation provides troubleshooting guidance

The database is ready for the period-based attendance system with optimized query performance through proper indexing.
