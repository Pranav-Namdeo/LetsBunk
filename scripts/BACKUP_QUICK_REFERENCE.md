# Database Backup - Quick Reference Guide

## Quick Commands

### Create Backup
```bash
# Windows
BACKUP_DATABASE.bat

# Linux/Mac/Command Line
node scripts/backup-database.js
```

### List Backups
```bash
# Windows
dir backups

# Linux/Mac
ls -la backups/

# Or run restore without arguments
node scripts/restore-database.js
```

### Restore Backup
```bash
node scripts/restore-database.js backup_2024-01-15_14-30-00
```

## Pre-Migration Checklist

- [ ] Ensure `.env` file has correct `MONGODB_URI`
- [ ] Test database connection: `node check-students.js`
- [ ] Create backup: `node scripts/backup-database.js`
- [ ] Note backup folder name (e.g., `backup_2024-01-15_14-30-00`)
- [ ] Verify backup files exist in `backups/` directory
- [ ] Keep backup folder name for potential rollback

## Backup Location

```
backups/
└── backup_YYYY-MM-DD_HH-MM-SS/
    ├── metadata.json              # Backup information
    ├── studentmanagements.json    # Student data
    ├── teachers.json              # Teacher data
    ├── timetables.json            # Timetable data
    ├── attendancerecords.json     # Attendance records
    ├── attendancesessions.json    # Timer sessions (to be removed)
    └── ...                        # Other collections
```

## Important Notes

⚠️ **CRITICAL**: Always create a backup BEFORE running migration!

✅ **Backup includes**:
- All student records
- All teacher records
- All timetables
- All attendance records
- All timer sessions (legacy data)
- All system settings

❌ **Restore will**:
- **DELETE** all current data
- **REPLACE** with backup data
- Cannot be undone

## Troubleshooting

### "Cannot connect to MongoDB"
→ Check `.env` file has `MONGODB_URI`
→ Verify internet connection
→ Check MongoDB Atlas status

### "Backup directory not found"
→ Run backup script first: `node scripts/backup-database.js`
→ Check folder name is correct

### "Out of disk space"
→ Delete old backups: `rm -rf backups/backup_OLD_*`
→ Free up disk space

## Support

For detailed documentation, see: `scripts/BACKUP_DOCUMENTATION.md`

For issues:
1. Check error messages in console
2. Verify `.env` configuration
3. Test MongoDB connection
4. Review backup logs
