const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/site-content.js'), 'utf8');
function fixture(host = '127.0.0.1') {
  const storage = new Map();
  const calls = [];
  const window = { TriptiSupabase: { select: async (...args) => { calls.push(args); return []; }, insert: async (...args) => calls.push(args) } };
  vm.runInNewContext(source, { window, location: { hostname: host }, URL, structuredClone, localStorage: { getItem: key=>storage.get(key), setItem: (key,value)=>storage.set(key,value) } });
  return { service: window.TriptiContent, storage, calls };
}
test('legacy dashboard branding migrates without changing contact or URL settings', async () => {
  const { service, storage } = fixture();
  storage.set('triptiContentPreviewV1', JSON.stringify({brand:'Tripti Jewellers',copyright:'Tripti Jewellers. All rights reserved.',email:'triptijewellers4826@gmail.com',instagram:'https://instagram.com/triptijewellers',locatorTitle:'Welcome to Tripti Jewellers!'}));
  const value = await service.load();
  assert.equal(value.brand, 'Puru Raj Jewelllers');
  assert.equal(value.locatorTitle, 'Welcome to Puru Raj Jewelllers!');
  assert.equal(value.email, 'triptijewellers4826@gmail.com');
  assert.equal(value.instagram, 'https://instagram.com/triptijewellers');
});
test('local settings persist across reloads without touching the live database', async () => {
  const { service, calls, storage } = fixture();
  const value = structuredClone(await service.load());
  value.phone = '+91 1234567890';
  await service.save(value);
  assert.equal(calls.length, 0);
  assert.equal(JSON.parse(storage.get('triptiContentPreviewV1')).phone, value.phone);
  assert.equal((await service.load()).phone, value.phone);
});
test('delivery checks reject invalid PINs and favour specific exclusions over broad coverage', async () => {
  const { service } = fixture();
  const value = await service.load();
  value.zones = [
    { prefix: '110', available: true, minDays: 3, maxDays: 5, cod: true },
    { prefix: '110001', available: false, minDays: 3, maxDays: 5 }
  ];
  await service.save(value);
  assert.equal(service.deliveryResult('abc123').type, 'error');
  assert.equal(service.deliveryResult('000001').type, 'error');
  assert.equal(service.deliveryResult('110001').type, 'error');
  assert.equal(service.deliveryResult('110002').type, 'success');
  assert.equal(service.deliveryResult('560001').type, 'info');
});
test('nearest-store distance handles missing pins and same-location pins', () => {
  const { service } = fixture();
  assert.equal(service.distance(28, 77, { lat: '', lng: '' }), Infinity);
  assert.equal(service.distance(28, 77, { lat: 28, lng: 77 }), 0);
  assert.ok(service.distance(28, 77, { lat: 29, lng: 77 }) > 110);
});
test('external links reject executable URLs and text is escaped', () => {
  const { service } = fixture();
  assert.equal(service.safeUrl('javascript:alert(1)'), '');
  assert.equal(service.safeUrl('data:text/html,bad'), '');
  assert.equal(service.safeUrl('https://example.com'), 'https://example.com/');
  assert.equal(service.esc('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;');
});
test('all reference information pages are present and malformed imports keep defaults', async () => {
  const { service } = fixture();
  const value = await service.save({ brand: null, stores: [null], pages: [{ slug: 'privacy', body: '<b>Edited</b>' }] });
  assert.equal(value.brand, 'Puru Raj Jewelllers');
  assert.equal(value.pages.length, 12);
  assert.equal(value.stores.length, 0);
  assert.equal(value.pages.find(p=>p.slug==='privacy').body, '<b>Edited</b>');
});
