#!/usr/bin/env node
/**
 * audit-routes.js
 * Scans server.js for duplicate route definitions and outputs a JSON report.
 */
const fs   = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '..', 'server.js');
const src   = fs.readFileSync(serverFile, 'utf8');
const lines = src.split('\n');

// Match: app.get('/path', ...) or app.post(`/path`, ...)
const routeRe = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i;

const routes = {};   // key -> [lineNumbers]
const allRoutes = []; // ordered list

lines.forEach((line, i) => {
  const m = line.match(routeRe);
  if (m) {
    const method = m[1].toUpperCase();
    const routePath = m[2];
    const key = `${method} ${routePath}`;
    if (!routes[key]) routes[key] = [];
    routes[key].push(i + 1);
    allRoutes.push({ method, path: routePath, line: i + 1 });
  }
});

const dupes = Object.entries(routes)
  .filter(([, v]) => v.length > 1)
  .map(([k, v]) => ({ route: k, lines: v }));

console.log('=== DUPLICATE ROUTES IN server.js ===\n');
if (dupes.length === 0) {
  console.log('No duplicates found.');
} else {
  dupes.forEach(d => {
    console.log(`  ${d.route}`);
    d.lines.forEach((ln, idx) => {
      const snippet = lines[ln - 1].trim().slice(0, 80);
      console.log(`    [${idx === 0 ? 'KEEP' : 'DUPE'}] line ${ln}: ${snippet}`);
    });
    console.log();
  });
}

console.log(`Total routes   : ${Object.keys(routes).length}`);
console.log(`Duplicate routes: ${dupes.length}`);

// Write JSON report for the Python fixer
const report = { duplicates: dupes, allRoutes };
const outFile = path.join(__dirname, 'route-audit.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\nReport written to: ${outFile}`);
