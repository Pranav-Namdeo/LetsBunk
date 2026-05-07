#!/usr/bin/env python3
"""
fix-duplicate-routes.py
Removes duplicate route handlers from server.js, keeping the canonical version.

Strategy:
  - For each duplicate pair, identify the DUPE (to remove) by line number.
  - Extract the full handler block (from the app.METHOD line to the closing });)
  - Replace it with a single-line comment explaining the removal.
  - Write the cleaned file back.

Run: python scripts/fix-duplicate-routes.py
"""

import re
import sys
import os

SERVER_FILE = os.path.join(os.path.dirname(__file__), '..', 'server.js')

# ── Duplicates to remove ──────────────────────────────────────────────────────
# Each entry: (dupe_line_1based, canonical_line_1based, description)
DUPES_TO_REMOVE = [
    # GET /api/attendance/export
    # Keep: line 3944 (PeriodAttendance CSV — used by admin panel period report)
    # Remove: line 9440 (AttendanceHistory aggregate — old, unused)
    (9440, 3944, 'GET /api/attendance/export (old AttendanceHistory version — superseded by line 3944)'),

    # GET /api/config/branches
    # Keep: line 5222 (merged Config+StudentManagement+Timetable — canonical)
    # Remove: line 5869 (StudentManagement.distinct only — incomplete)
    (5869, 5222, 'GET /api/config/branches (StudentManagement.distinct only — superseded by line 5222)'),

    # GET /api/config/semesters
    # Keep: line 5266 (getSemestersFromConfig — canonical)
    # Remove: line 5897 (StudentManagement.distinct only — incomplete)
    (5897, 5266, 'GET /api/config/semesters (StudentManagement.distinct only — superseded by line 5266)'),

    # GET /api/settings/attendance-threshold
    # Keep: line 7545 (uses daily_threshold key + ATTENDANCE_THRESHOLD in-memory — canonical)
    # Remove: line 7388 (uses attendance_threshold key — stale key name)
    (7388, 7545, 'GET /api/settings/attendance-threshold (stale key "attendance_threshold" — superseded by line 7545)'),
]


def find_handler_block(lines, start_line_1based):
    """
    Given the 1-based line number of an app.METHOD(...) call,
    find the end of the handler block (the closing '});' at the same indent level).
    Returns (start_idx, end_idx) as 0-based indices (inclusive).
    """
    start_idx = start_line_1based - 1
    line = lines[start_idx]

    # Count opening braces on the start line
    depth = line.count('{') - line.count('}')

    # If the handler is a one-liner (depth == 0 already), just return that line
    if depth == 0:
        return start_idx, start_idx

    end_idx = start_idx
    for i in range(start_idx + 1, len(lines)):
        l = lines[i]
        depth += l.count('{') - l.count('}')
        if depth <= 0:
            end_idx = i
            break

    return start_idx, end_idx


def remove_duplicate(lines, dupe_line, canonical_line, description):
    """Remove the handler block at dupe_line and replace with a comment."""
    start, end = find_handler_block(lines, dupe_line)
    indent = '    '  # 4 spaces

    replacement = [
        f'// ── REMOVED DUPLICATE: {description}\n',
        f'// ── Canonical handler is at line {canonical_line} (above).\n',
    ]

    print(f'  Removing lines {start+1}–{end+1} ({end - start + 1} lines)')
    print(f'  Replacing with {len(replacement)} comment lines')

    new_lines = lines[:start] + replacement + lines[end + 1:]
    return new_lines


def main():
    print(f'Reading {SERVER_FILE}...')
    with open(SERVER_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines(keepends=True)
    original_count = len(lines)
    print(f'Total lines: {original_count}\n')

    # Process dupes from BOTTOM to TOP so line numbers stay valid
    sorted_dupes = sorted(DUPES_TO_REMOVE, key=lambda x: x[0], reverse=True)

    for dupe_line, canonical_line, description in sorted_dupes:
        print(f'Processing: {description}')
        print(f'  Dupe at line {dupe_line}, canonical at line {canonical_line}')
        lines = remove_duplicate(lines, dupe_line, canonical_line, description)
        print()

    new_count = len(lines)
    print(f'Lines before: {original_count}')
    print(f'Lines after:  {new_count}')
    print(f'Lines removed: {original_count - new_count}')

    # Write back
    with open(SERVER_FILE, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    print(f'\n✅ server.js updated successfully.')

    # Verify no more duplicates
    print('\nVerifying...')
    with open(SERVER_FILE, 'r', encoding='utf-8') as f:
        new_content = f.read()

    new_lines = new_content.split('\n')
    route_re = re.compile(r"app\.(get|post|put|delete|patch)\s*\(\s*['\"`]([^'\"`]+)['\"`]", re.IGNORECASE)
    routes = {}
    for i, line in enumerate(new_lines):
        m = route_re.search(line)
        if m:
            key = f"{m.group(1).upper()} {m.group(2)}"
            routes.setdefault(key, []).append(i + 1)

    remaining_dupes = {k: v for k, v in routes.items() if len(v) > 1}
    if remaining_dupes:
        print(f'⚠️  Still {len(remaining_dupes)} duplicate(s) remaining:')
        for k, v in remaining_dupes.items():
            print(f'  {k} -> lines {v}')
    else:
        print('✅ No duplicate routes remaining.')


if __name__ == '__main__':
    main()
