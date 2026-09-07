const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('all brand placements use the supplied PRJ logo without missing asset', () => {
  const logo = fs.readFileSync(path.join(root, 'images/puru-raj-prj-logo.png'));
  assert.equal(logo.subarray(1, 4).toString(), 'PNG');
  let placements = 0;
  const files = fs.readdirSync(root).filter(file => file.endsWith('.html')).concat('js/site-content.js');
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!source.includes('images/tripti-tj-monogram-transparent.png'), file);
    placements += (source.match(/images\/puru-raj-prj-logo\.png/g) || []).length;
  }
  assert.ok(placements >= 20);
});
