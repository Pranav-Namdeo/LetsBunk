#!/usr/bin/env node
/**
 * backup-to-md.js
 * Scans the backup/2026-05-07/ folder and generates a structured
 * DATABASE_SNAPSHOT.md with headings, stats, and sample records.
 */

const fs   = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'backup', '2026-05-07');
const OUT_FILE   = path.join(__dirname, '..', 'DATABASE_SNAPSHOT.md');

// Sensitive fields to mask in output
const MASK_FIELDS = new Set(['password', 'faceEmbedding', 'faceDescriptor', 'token', 'secret']);

// How many sample records to show per collection
const SAMPLE_COUNT = 3;

// ── helpers ──────────────────────────────────────────────────────────────────

function maskDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (MASK_FIELDS.has(k)) {
      if (Array.isArray(v)) out[k] = `[${v.length} floats — redacted]`;
      else out[k] = '*** redacted ***';
    } else if (Array.isArray(v)) {
      out[k] = v.length > 3 ? `[Array(${v.length})]` : v.map(maskDoc);
    } else if (v && typeof v === 'object' && !v.$oid && !v.$date) {
      out[k] = maskDoc(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function jsonBlock(obj) {
  return '```json\n' + JSON.stringify(obj, null, 2) + '\n```';
}

function tableRow(cells) {
  return '| ' + cells.join(' | ') + ' |';
}

function tableHeader(cols) {
  return tableRow(cols) + '\n' + tableRow(cols.map(() => '---'));
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function isoDate(v) {
  if (!v) return '—';
  if (v.$date) return new Date(v.$date).toISOString().replace('T', ' ').split('.')[0];
  if (typeof v === 'string') return v.split('.')[0].replace('T', ' ');
  return String(v);
}

// ── collection-specific summary renderers ────────────────────────────────────

function summarise(name, docs) {
  if (docs.length === 0) return '_No records._\n';

  switch (name) {

    case 'studentmanagements': {
      const rows = docs.map(d => [
        d.enrollmentNo || '—',
        d.name || '—',
        d.branch || '—',
        d.semester || '—',
        d.email || '—',
        d.isActive ? '✅' : '❌',
        d.faceEmbedding?.length ? '✅' : '❌',
        d.status || '—'
      ]);
      return tableHeader(['Enrollment', 'Name', 'Branch', 'Sem', 'Email', 'Active', 'Face', 'Status']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'teachers': {
      const rows = docs.map(d => [
        d.employeeId || '—',
        d.name || '—',
        d.email || '—',
        d.department || '—',
        (d.subjects || [d.subject]).filter(Boolean).join(', ') || '—',
        d.canEditTimetable ? '✅' : '❌'
      ]);
      return tableHeader(['Employee ID', 'Name', 'Email', 'Dept', 'Subjects', 'Can Edit TT']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'classrooms': {
      const rows = docs.map(d => [
        d.roomNumber || '—',
        d.building || '—',
        d.capacity || '—',
        (d.wifiBSSIDs || (d.wifiBSSID ? [d.wifiBSSID] : [])).join(', ') || '—',
        d.isActive ? '✅' : '❌'
      ]);
      return tableHeader(['Room', 'Building', 'Capacity', 'BSSIDs', 'Active']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'subjects': {
      const rows = docs.map(d => [
        d.subjectCode || '—',
        d.subjectName || '—',
        d.shortName || '—',
        d.semester || '—',
        d.branch || '—',
        d.type || '—',
        d.isActive ? '✅' : '❌'
      ]);
      return tableHeader(['Code', 'Name', 'Short', 'Sem', 'Branch', 'Type', 'Active']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'timetables': {
      let out = '';
      for (const tt of docs) {
        out += `**Semester ${tt.semester} — ${tt.branch}**\n\n`;
        // Periods
        if (tt.periods?.length) {
          out += tableHeader(['#', 'Start', 'End']) + '\n';
          tt.periods.forEach((p, i) => {
            out += tableRow([`P${i+1}`, p.startTime || '—', p.endTime || '—']) + '\n';
          });
          out += '\n';
        }
        // Schedule sample (Monday)
        const days = Object.keys(tt.timetable || {});
        for (const day of days.slice(0, 3)) {
          const slots = tt.timetable[day] || [];
          if (slots.length === 0) continue;
          out += `_${day.charAt(0).toUpperCase() + day.slice(1)}:_ `;
          out += slots.map((s, i) => s.isBreak ? `P${i+1}:Break` : `P${i+1}:${s.subject||'—'}(${s.teacher||'—'})`).join(' · ') + '\n\n';
        }
      }
      return out;
    }

    case 'configs': {
      const byType = {};
      docs.forEach(d => { (byType[d.type] = byType[d.type] || []).push(d); });
      let out = '';
      for (const [type, items] of Object.entries(byType)) {
        out += `**${type.charAt(0).toUpperCase() + type.slice(1)}s:**\n\n`;
        out += tableHeader(['Value', 'Display Name', 'Active']) + '\n';
        items.forEach(d => {
          out += tableRow([d.value || '—', d.displayName || '—', d.isActive ? '✅' : '❌']) + '\n';
        });
        out += '\n';
      }
      return out;
    }

    case 'systemsettings':
    case 'settings': {
      const rows = docs.map(d => [
        d.settingKey || d.key || '—',
        String(d.settingValue ?? d.value ?? '—'),
        d.description || '—',
        isoDate(d.updatedAt || d.lastModifiedAt)
      ]);
      return tableHeader(['Key', 'Value', 'Description', 'Updated']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'periodattendances': {
      // Group by date, show counts
      const byDate = {};
      docs.forEach(d => {
        const dt = isoDate(d.date).split(' ')[0];
        if (!byDate[dt]) byDate[dt] = { present: 0, absent: 0, total: 0 };
        byDate[dt].total++;
        if (d.status === 'present') byDate[dt].present++;
        else byDate[dt].absent++;
      });
      const rows = Object.entries(byDate)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 20)
        .map(([dt, s]) => [dt, s.total, s.present, s.absent,
          s.total > 0 ? Math.round(s.present / s.total * 100) + '%' : '—']);
      return `_Showing last 20 days (${Object.keys(byDate).length} total days in DB)_\n\n`
        + tableHeader(['Date', 'Total Records', 'Present', 'Absent', 'Rate']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'attendancerecords': {
      const byStudent = {};
      docs.forEach(d => {
        const k = d.enrollmentNo || d.studentId || '?';
        if (!byStudent[k]) byStudent[k] = { name: d.studentName || k, days: 0, present: 0, absent: 0 };
        byStudent[k].days++;
        if (d.status === 'present') byStudent[k].present++;
        else byStudent[k].absent++;
      });
      const rows = Object.entries(byStudent).map(([enr, s]) => [
        enr, s.name, s.days, s.present, s.absent,
        s.days > 0 ? Math.round(s.present / s.days * 100) + '%' : '—'
      ]);
      return tableHeader(['Enrollment', 'Name', 'Days', 'Present', 'Absent', 'Rate']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'randomrings': {
      const rows = docs.map(d => [
        d.ringId?.slice(-8) || '—',
        d.teacherId || '—',
        d.semester || '—',
        d.branch || '—',
        d.period || '—',
        d.studentCount || 0,
        d.successfulVerifications || 0,
        d.status || '—',
        isoDate(d.triggeredAt)
      ]);
      return tableHeader(['Ring ID', 'Teacher', 'Sem', 'Branch', 'Period', 'Students', 'Verified', 'Status', 'Triggered']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'users': {
      const rows = docs.map(d => [
        d.username || d.email || '—',
        d.role || '—',
        isoDate(d.createdAt)
      ]);
      return tableHeader(['Username/Email', 'Role', 'Created']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    case 'holidays': {
      const rows = docs.map(d => [
        isoDate(d.date).split(' ')[0],
        d.name || '—',
        d.type || '—',
        d.description || '—'
      ]);
      return tableHeader(['Date', 'Name', 'Type', 'Description']) + '\n'
        + rows.map(tableRow).join('\n') + '\n';
    }

    default: {
      // Generic: show first SAMPLE_COUNT docs masked
      const samples = docs.slice(0, SAMPLE_COUNT).map(maskDoc);
      return `_Sample (${Math.min(SAMPLE_COUNT, docs.length)} of ${docs.length}):_\n\n`
        + samples.map(s => jsonBlock(s)).join('\n\n') + '\n';
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, '_manifest.json'), 'utf8'));
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json') && f !== '_manifest.json').sort();

  const lines = [];

  // ── Title ──
  lines.push(`# 🗄️ Database Snapshot — ${manifest.backupDate}`);
  lines.push('');
  lines.push(`> **Database:** \`${manifest.database}\`  `);
  lines.push(`> **Backup created:** ${manifest.createdAt}  `);
  lines.push(`> **Collections:** ${manifest.collections.length}  `);
  lines.push(`> **Total documents:** ${manifest.totalDocuments.toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── TOC ──
  lines.push('## 📋 Table of Contents');
  lines.push('');
  files.forEach(f => {
    const name = f.replace('.json', '');
    const anchor = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    lines.push(`- [${name}](#${anchor})`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Overview table ──
  lines.push('## 📊 Overview');
  lines.push('');
  lines.push(tableHeader(['Collection', 'Documents', 'File Size']));
  files.forEach(f => {
    const name = f.replace('.json', '');
    const filePath = path.join(BACKUP_DIR, f);
    const size = fs.statSync(filePath).size;
    const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    lines.push(tableRow([`\`${name}\``, docs.length.toLocaleString(), formatBytes(size)]));
  });
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Per-collection sections ──
  files.forEach(f => {
    const name = f.replace('.json', '');
    const filePath = path.join(BACKUP_DIR, f);
    const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const size = fs.statSync(filePath).size;

    lines.push(`## ${name}`);
    lines.push('');
    lines.push(`**Documents:** ${docs.length.toLocaleString()} · **Size:** ${formatBytes(size)}`);
    lines.push('');

    if (docs.length === 0) {
      lines.push('_Empty collection._');
    } else {
      // Schema — keys from first doc
      const keys = Object.keys(docs[0]).filter(k => !MASK_FIELDS.has(k));
      lines.push(`**Fields:** \`${keys.join('`, `')}\``);
      lines.push('');
      lines.push(summarise(name, docs));
    }

    lines.push('---');
    lines.push('');
  });

  const md = lines.join('\n');
  fs.writeFileSync(OUT_FILE, md, 'utf8');
  console.log(`✅ DATABASE_SNAPSHOT.md written (${formatBytes(Buffer.byteLength(md, 'utf8'))})`);
  console.log(`   Path: ${OUT_FILE}`);
}

main();
