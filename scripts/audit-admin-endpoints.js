/**
 * audit-admin-endpoints.js
 * Extracts every hardcoded /api/ URL from admin-panel/renderer.js and admin-panel/main.js,
 * then checks each against the live routes registered in server.js.
 */
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── 1. Extract all routes registered in server.js ────────────────────────────
const serverSrc   = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const serverLines = serverSrc.split('\n');
const routeRe     = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i;

const serverRoutes = new Set();
serverLines.forEach(line => {
  const m = line.match(routeRe);
  if (m) serverRoutes.add(`${m[1].toUpperCase()} ${m[2]}`);
});

// ── 2. Extract all /api/ calls from admin panel files ────────────────────────
const ADMIN_FILES = [
  'admin-panel/renderer.js',
  'admin-panel/main.js',
];

const urlRe = /['"`]\/api\/([^'"`\s?#]+)/g;

const adminCalls = [];

ADMIN_FILES.forEach(relPath => {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    let m;
    while ((m = urlRe.exec(line)) !== null) {
      const apiPath = '/api/' + m[1].replace(/\$\{[^}]+\}/g, ':param').replace(/\/+$/, '');

      let method = 'GET';
      if (/method\s*:\s*['"]POST['"]/i.test(line)) method = 'POST';
      else if (/method\s*:\s*['"]PUT['"]/i.test(line)) method = 'PUT';
      else if (/method\s*:\s*['"]DELETE['"]/i.test(line)) method = 'DELETE';

      for (let back = 1; back <= 5 && method === 'GET'; back++) {
        const prev = lines[i - back] || '';
        if (/method\s*:\s*['"]POST['"]/i.test(prev)) { method = 'POST'; break; }
        if (/method\s*:\s*['"]PUT['"]/i.test(prev))  { method = 'PUT';  break; }
        if (/method\s*:\s*['"]DELETE['"]/i.test(prev)){ method = 'DELETE'; break; }
      }

      adminCalls.push({ file: relPath, line: i + 1, method, path: apiPath });
    }
  });
});

// ── 3. Deduplicate ────────────────────────────────────────────────────────────
const seen = new Set();
const unique = adminCalls.filter(c => {
  const key = c.method + ' ' + c.path;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

function matchesServer(method, apiPath) {
  if (serverRoutes.has(`${method} ${apiPath}`)) return true;
  for (const route of serverRoutes) {
    const [rm, rp] = route.split(' ');
    if (rm !== method) continue;
    const pattern = '^' + rp.replace(/\/:[^/]+/g, '/[^/]+').replace(/\*/g, '.*') + '$';
    if (new RegExp(pattern).test(apiPath)) return true;
  }
  return false;
}

const dead   = unique.filter(c => !matchesServer(c.method, c.path));
const active = unique.filter(c =>  matchesServer(c.method, c.path));

console.log('='.repeat(80));
console.log('  ADMIN PANEL ENDPOINT AUDIT');
console.log('='.repeat(80));
console.log();
console.log(`✅ ACTIVE (${active.length}):`);
active.forEach(c => console.log(`  ${c.method.padEnd(7)} ${c.path.padEnd(55)} ${c.file}:${c.line}`));
console.log();
console.log(`❌ DEAD / MISSING (${dead.length}):`);
dead.forEach(c => console.log(`  ${c.method.padEnd(7)} ${c.path.padEnd(55)} ${c.file}:${c.line}`));
console.log();
console.log(`Total: ${unique.length}  Active: ${active.length}  Dead: ${dead.length}`);
