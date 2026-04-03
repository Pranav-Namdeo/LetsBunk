# Migration Quick Start Guide

## TL;DR - Run Migration in 3 Steps

### 1. Test First (Dry Run)
```bash
node scripts/migrate-to-period-based.js --dry-run
```
✓ Shows what will happen without making changes

### 2. Run Migration
```bash
node scripts/migrate-to-period-based.js
```
✓ Creates backup automatically
✓ Executes all schema changes
✓ Generates detailed report

### 3. Restart Server
```bash
# Stop and restart your Node.js application
```
✓ Loads new schemas
✓ Ready to use period-based attendance

---

## What Gets Changed

### ✅ Created
- `periodattendances` collection (period-level records)
- `dailyattendances` collection (daily aggregation)
- `attendanceaudits` collection (audit trail)
- `systemsettings` collection (configuration)
- 13 performance indexes
- Default threshold setting (75%)

### ❌ Removed
- `attendancesessions` collection (DELETED)
- Timer fields from `studentmanagements`
- Timer fields from `randomrings`

### 🔒 Preserved
- All student data
- All teacher data
- All timetable data
- All classroom data
- All existing attendance records

---

## If Something Goes Wrong

### Rollback Command
```bash
node scripts/restore-database.js backup_YYYY-MM-DD_HH-MM-SS
```

### Find Your Backup
```bash
# List available backups
ls backups/
```

---

## Migration Timeline

| Step | Duration | Description |
|------|----------|-------------|
| 0 | 5s | Pre-checks |
| 1 | 30-60s | Create backup |
| 2 | 5s | Verify schemas |
| 3 | 10-30s | Update students |
| 4 | 5-10s | Update random rings |
| 5 | 5s | Drop sessions |
| 6 | 10s | Create indexes |
| 7 | 2s | Seed settings |
| 8 | 5s | Verify success |
| **Total** | **2-3 min** | **Complete migration** |

*Times are estimates for typical database sizes (1000-5000 students)*

---

## Post-Migration Checklist

- [ ] Server restarted
- [ ] Check-in tested
- [ ] Random ring tested
- [ ] Reports working
- [ ] No errors in logs
- [ ] Backup kept safe

---

## Need Help?

📖 **Full Guide**: `scripts/MIGRATION_GUIDE.md`
📋 **Scripts README**: `scripts/README.md`
🎯 **Design Doc**: `.kiro/specs/period-based-attendance-system/design.md`

---

## Command Reference

```bash
# Dry run (test mode)
node scripts/migrate-to-period-based.js --dry-run

# Full migration
node scripts/migrate-to-period-based.js

# Skip backup (not recommended)
node scripts/migrate-to-period-based.js --skip-backup

# Verify indexes after migration
node scripts/verify-indexes.js

# Restore from backup
node scripts/restore-database.js <backup-folder-name>

# Create manual backup
node scripts/backup-database.js
```

---

**⚠️ Important Notes**

1. **Backup is automatic** - Script creates backup before changes
2. **Migration is idempotent** - Safe to re-run if it fails
3. **No data loss** - Only timer-based session data is deleted (by design)
4. **Downtime required** - Stop server during migration
5. **Keep backup 7 days** - Don't delete immediately

---

**Ready to migrate? Start with dry run!**

```bash
node scripts/migrate-to-period-based.js --dry-run
```
