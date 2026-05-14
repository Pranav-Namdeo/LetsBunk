const fs = require('fs');
const xml = fs.readFileSync('d:/bunk bssid/screen.xml', 'utf8');

// Parse all nodes with their depth, class, text, bounds, and index
const nodeRegex = /<node[^>]*>/g;
let match;
const nodes = [];

while ((match = nodeRegex.exec(xml)) !== null) {
  const node = match[0];
  const get = (attr) => {
    const m = node.match(new RegExp(attr + '="([^"]*)"'));
    return m ? m[1] : '';
  };

  // Calculate depth by counting position in XML
  const before = xml.substring(0, match.index);
  const depth = (before.match(/<node/g) || []).length - (before.match(/<\/node>/g) || []).length;

  nodes.push({
    depth,
    class: get('class').replace('android.view.', '').replace('android.widget.', '').replace('com.facebook.react.views.view.', 'RCTView.').replace('com.facebook.react.views.text.', 'RCTText.').replace('com.facebook.react.views.scroll.', 'RCTScroll.'),
    text: get('text'),
    bounds: get('bounds'),
    clickable: get('clickable'),
    index: get('index'),
    resourceId: get('resource-id'),
  });
}

console.log('=== LAYER TREE (' + nodes.length + ' nodes) ===\n');

nodes.forEach((n, i) => {
  const indent = '  '.repeat(Math.max(0, n.depth));
  const textPart = n.text ? ' "' + n.text.substring(0, 40) + '"' : '';
  const clickPart = n.clickable === 'true' ? ' [CLICKABLE]' : '';
  const idPart = n.resourceId ? ' #' + n.resourceId.split('/').pop() : '';
  console.log(indent + '[' + n.depth + '] ' + n.class + textPart + idPart + clickPart + '  ' + n.bounds);
});

// Summary: count by class
console.log('\n=== CLASS SUMMARY ===');
const classCounts = {};
nodes.forEach(n => {
  const c = n.class.split('.')[0];
  classCounts[c] = (classCounts[c] || 0) + 1;
});
Object.entries(classCounts).sort((a,b) => b[1]-a[1]).forEach(([c, count]) => {
  console.log(count + 'x ' + c);
});

// Find overlapping/stacked views (same bounds, different nodes)
console.log('\n=== POTENTIAL OVERLAPPING LAYERS ===');
const boundsMap = {};
nodes.forEach(n => {
  if (!n.bounds || n.bounds === '[0,0][0,0]') return;
  if (!boundsMap[n.bounds]) boundsMap[n.bounds] = [];
  boundsMap[n.bounds].push(n);
});
Object.entries(boundsMap).forEach(([bounds, ns]) => {
  if (ns.length > 1) {
    console.log('Bounds ' + bounds + ':');
    ns.forEach(n => console.log('  [' + n.depth + '] ' + n.class + (n.text ? ' "' + n.text + '"' : '')));
  }
});
