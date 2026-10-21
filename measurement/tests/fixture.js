// Isolated browser fixtures. Never loaded by the production Measurement page.
(function () {
 if (MeasurementParts.live) MeasurementParts.live.enabled = false;
 window.addEventListener('unhandledrejection', e => { document.body.append(Kit.h('pre', { role:'alert' }, String(e.reason && e.reason.stack || e.reason))); });
 window.addEventListener('error', e => { document.body.append(Kit.h('pre', { role:'alert' }, e.message)); });
 const today = Kit.today();
 const data = { rev:0, clients: [
  { id:'qa-a', name:'QA Scheduled Client', pid:'QA-001', stage:'design', city:'Delhi', siteState:'Delhi', product:'Kitchen', coordinates:[28.61,77.21], measurement:{ requestedAt:today, date:Kit.addDays(today,2), assignee:'QA Surveyor', changedAt:Kit.now() } },
  { id:'qa-b', name:'QA Late Client', pid:'QA-002', stage:'design', city:'Pune', product:'Kitchen', measurement:{ requestedAt:Kit.addDays(today,-5), date:Kit.addDays(today,-1) }, measurementVisits:{ pdi:{ requestedAt:today, problems:[{id:'qa-problem',title:'Site access blocked',reason:'Access',status:'Open',history:[]}]} } },
  { id:'qa-c', name:'QA New Client', pid:'QA-003', stage:'qualified', city:'Mumbai', product:'Kitchen' }
 ] };
 data.clients.forEach(c => { c.cid = 'C-' + c.id; SalesLogic.ensure(c); });
 Kit.store.load = () => { Kit.store.data = data; return Promise.resolve(data); };
 Kit.store.save = () => { document.documentElement.dataset.testSaves = String(Number(document.documentElement.dataset.testSaves || 0) + 1); };
 Kit.store.watch = () => {};
})();
