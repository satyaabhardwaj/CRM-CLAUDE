// Live records stay separate from Kit.store: visiting Measurement never imports
// thousands of Zoho orders into Sales, Design or Accounts.
(function () {
  const M = MeasurementParts, h = Kit.h;
  const live = M.live = { enabled:true, started:false, loading:false, error:'', records:[], syncedAt:'', orders:0, context:null };
  function adapt(r) {
    const status = r.status === 'Completed' ? 'Done' : r.status;
    const c = { id:r.record_id, name:r.client, pid:r.order, cid:'', city:r.city, siteState:r.state, siteAddress:r.address, product:r.product, docs:{}, design:{}, timeline:{}, stage:r.crm_stage };
    return Object.assign({}, r, { c, m:{ requestedAt:r.requested_at }, status,
      changed:r.modified_at || '', late:status !== 'Done' && !!M.day(r.date) && r.date < Kit.today(),
      assignee:r.assigned_person || '', city:r.city === 'City not added' ? '' : r.city,
      problems:[], tasks:[] });
  }
  live.load = async function (refresh) {
    if (live.loading) return;
    live.started = true; live.loading = true; live.error = '';
    if (live.context) live.context.update();
    try {
      const response = await fetch('/api/measurement/requests' + (refresh ? '?refresh=1' : ''), { cache:'no-store' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.requests)) throw new Error(data.error || 'The Measurement connection is unavailable. Start the CRM with measurement/server.py.');
      live.records = data.requests.map(adapt); live.syncedAt = data.synced_at; live.orders = data.orders_scanned;
    } catch (error) {
      live.error = error instanceof SyntaxError ? 'The live Measurement endpoint is unavailable. Start the CRM with measurement/server.py.' : error.message;
    } finally {
      live.loading = false; if (live.context) live.context.update();
    }
  };
  live.banner = function () {
    return h('div', { class:'m-toolbar', role:'status' }, h('b', null, 'Live Zoho CRM'),
      h('span', { class:'sub' }, live.loading ? 'Refreshing Orders…' : live.syncedAt ? live.orders + ' orders scanned · synced ' + Kit.dayTime(live.syncedAt) : 'Connecting…'),
      Kit.btn(live.loading ? 'Refreshing…' : 'Refresh', () => live.load(true), 'small', { disabled:live.loading }));
  };
  live.unavailable = function () {
    return h('section', { class:'card m-status', role:live.error ? 'alert' : 'status' }, h('h2', null, live.error ? 'Measurement data could not be loaded' : 'Loading live measurement requests'),
      h('p', { style:'margin:14px 0' }, live.error || 'Reading all Orders from Zoho. The first sync can take a minute.'),
      live.syncedAt ? h('p', { class:'sub' }, 'Last successful sync: ' + Kit.dayTime(live.syncedAt) + '. Counts are hidden until the connection recovers.') : null,
      live.error ? Kit.btn('Try again', () => live.load(true), 'dark') : null);
  };
  M.liveDetails = function (r) {
    const fact = (label, value) => h('div', null, h('span', null, label), h('b', null, value || 'Not provided'));
    return { title:r.client, tag:M.pill(r), sub:[r.order,r.stage,'Zoho Orders'].filter(Boolean).join(' · '), body:[
      h('div', { class:'cols' }, Kit.card('Visit', '', 'grey', h('div', { class:'facts' }, fact('Visit type',r.stage), fact('Status',r.status), fact('Visit date',r.date ? Kit.day(r.date) : ''), fact('Expected visit',r.expected_date ? Kit.day(r.expected_date) : ''), fact('Measurement person',r.assigned_person), fact('Requested',r.requested_at ? Kit.dayTime(r.requested_at) : ''), fact('Completed',r.completed_date ? Kit.dayTime(r.completed_date) : '')), r.schedule_note ? h('p', { class:'sub' },r.schedule_note) : null),
      Kit.card('Site', '', 'grey',h('div', { class:'facts' },fact('City',r.city),fact('State',r.state),fact('Zone',r.zone),fact('Address',r.address),fact('Product',r.product)),r.coordinates ? Kit.btn('Show on map',()=>{M.view.mapRequest=r.id;live.context.go(live.context.tab,'areas');}) : h('p',{class:'sub'},'Exact site coordinates are not recorded in Zoho.')),
      Kit.card('Source', '', 'grey',h('div',{class:'facts'},fact('CRM order ID',r.record_id),fact('CRM workflow',r.crm_stage),fact('Owner',r.owner),fact('Request bucket',r.request_bucket),fact('Last order change',r.modified_at ? Kit.dayTime(r.modified_at) : '')))),
      h('p',{class:'m-note'},'These are live, read-only Zoho records. Scheduling and status changes must be made in Zoho; refresh here to see the latest data.') ] };
  };
  setInterval(() => { if (live.enabled && live.started && Kit.showing('measurement') && !Kit.busy()) live.load(false); }, 300000);
})();
