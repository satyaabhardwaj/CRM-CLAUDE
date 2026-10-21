const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = require('../common/source-model.js');
function model() {
 const context = { window: { Measurements: source }, Kit: { h() {}, today: () => '2026-10-19' }, People: { owner: c => c.owner || '' } };
 vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../common/pieces.js'), 'utf8'), context);
 return context.window.MeasurementParts;
}
const c = (id, extra) => ({ id, name: id, stage: 'design', ...extra });
test('Only explicit requests create visits; all four types have stable unique IDs', () => {
 const m = model(), clients = [c('empty'), c('a', { measurement: {}, measurementVisits: { 'ept-marking': {}, 'ept-verification': {}, pdi: {} } }), c('bin', { stage: 'bin', measurement: {} })];
 const rows = m.requests(clients); assert.equal(rows.length, 4); assert.equal(new Set(rows.map(r => r.id)).size, 4); assert.equal(m.count(rows).Open, 4);
});
test('Dates distinguish scheduled, late, stale booking, invalid date and done', () => {
 const m = model();
 const rows = m.requests([c('today', { measurement: { date:'2026-10-19' } }), c('late', { measurement: { date:'2026-10-18' } }), c('stale', { measurement: { date:'2026-10-20', requestedAt:'2026-10-21' } }), c('invalid', { measurement: { date:'2026-02-30' } }), c('done', { measurement: { date:'2026-10-18', doneAt:'2026-10-18T10:00:00Z' } })]);
 assert.equal(m.count(rows).Scheduled, 1); assert.equal(m.count(rows).Late, 1); assert.equal(m.count(rows)['To Schedule'], 3); assert.equal(m.count(rows).Done, 1);
});
test('Same filters drive all pages and preserve explicit stage selection', () => {
 const m = model(), rows = m.requests([c('a', { city:'Delhi', measurement: {}, measurementVisits: { pdi: {} } }), c('b', { city:'Pune', measurement: { doneAt:'2026-10-18' } })]);
 m.view.filters.city = 'Delhi'; assert.equal(m.filtered(rows, 'all').length, 2); assert.equal(m.filtered(rows, 'pdi').length, 1);
 m.view.status = 'Done'; assert.equal(m.filtered(rows, 'all').length, 0);
});
test('No inferred coordinates or approvals from design workflow', () => {
 const m = model(), rows = m.requests([c('a', { city:'Delhi', coordinates:[0,0], measurement:{} }), c('b', { coordinates:[28.6,77.2], measurement:{} }), c('c', { post:{ pdi:{ approvedAt:'2026-10-19' } } })]);
 assert.equal(rows.length, 2); assert.equal(rows[0].coordinates, null); assert.deepEqual(rows[1].coordinates, [28.6,77.2]);
});
test('Problem filter excludes resolved records and tasks never complete visits', () => {
 const m = model(), rows = m.requests([c('a', { measurement: { problems:[{status:'Resolved'}] } }), c('b', { measurement: { problems:[{status:'Open'}], tasks:[{status:'Done'}] } })]);
 m.view.filters.withProblems = true; assert.equal(m.filtered(rows, 'all').length, 1); assert.equal(rows[1].status, 'To Schedule');
});
