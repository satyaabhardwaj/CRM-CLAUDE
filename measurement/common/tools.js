(function () {
  const M = MeasurementParts, h = Kit.h, view = M.view;
  M.dialog = function (title, build) {
    const previous = document.activeElement;
    const dialog = h('dialog', { class: 'm-dialog', 'aria-label': title });
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    const close = () => dialog.close();
    dialog.append(h('h2', null, title), build(close));
    dialog.addEventListener('close', () => { dialog.remove(); if (previous && previous.isConnected) previous.focus(); });
    document.body.append(dialog); dialog.showModal();
  };
  M.filters = function (ctx) {
    M.dialog('Filter measurement requests', close => {
      const draft = JSON.parse(JSON.stringify(view.filters));
      const all = M.requests(ctx.all), status = { value: view.status };
      const choices = key => [...new Set(all.map(r => r[key]).filter(Boolean))].sort();
      const field = (label, key, values) => Kit.field(label, Kit.select(values, draft[key], v => { draft[key] = v; }, { label, placeholder: key === 'dateRange' ? false : 'All' }));
      const stages = h('fieldset', null, h('legend', null, 'Visit types'), M.STAGES.map(s => h('label', { class: 'm-check' }, h('input', { type: 'checkbox', checked: draft.stages.includes(s), onchange: e => { draft.stages = e.target.checked ? [...draft.stages, s] : draft.stages.filter(x => x !== s); } }), s)));
      const error = h('p', { class: 'm-error', role: 'alert' });
      return h('div', null, stages, h('div', { class: 'm-fields' },
        field('City', 'city', choices('city')), field('State', 'region', choices('state')),
        field('Sales person', 'owner', choices('owner')), field('Product', 'product', choices('product')), field('Zone', 'zone', choices('zone')),
        field(M.live && M.live.enabled ? 'Last order change' : 'Last request change', 'dateRange', ['All time', 'Today', 'Last 7 days', 'Last 30 days', 'This month']),
        Kit.field('Status', Kit.select(['Open', 'Scheduled', 'To Schedule', 'Late', 'Done'], status.value, v => { status.value = v; }, { label: 'Status', placeholder: 'All statuses' }))),
      M.live && M.live.enabled ? null : h('label', { class: 'm-check' }, h('input', { type: 'checkbox', checked: draft.withProblems, onchange: e => { draft.withProblems = e.target.checked; } }), 'With unresolved problems'), error,
        h('div', { class: 'm-actions' }, Kit.btn('Cancel', close), Kit.btn('Apply filters', () => {
          if (!draft.stages.length) { error.textContent = 'Choose at least one visit type.'; return; }
          view.filters = draft; view.status = status.value; view.expanded = false; view.area = ''; close(); ctx.go('all', ctx.page);
        }, 'dark')));
    });
  };
  M.filterSummary = function (ctx) {
    const f = view.filters;
    return [ctx.tab !== 'all' ? ctx.tab.replace(/-/g, ' ') : f.stages.length === 4 ? 'All four visit types' : f.stages.join(', '), view.status || 'All statuses',
      f.search && 'Search: ' + f.search, f.city, f.region, f.owner, f.product, f.zone, f.dateRange !== 'All time' && f.dateRange, f.withProblems && 'Unresolved problems'].filter(Boolean).join(' · ');
  };
  M.toolbar = function (ctx, list) {
    const search = Kit.input(view.filters.search, value => { view.filters.search = value; view.expanded = false; ctx.update(); }, { type: 'search', placeholder: 'Search client, project, city or person', label: 'Search requests' });
    return h('div', { class: 'm-toolbar' }, search, Kit.btn('Filters', () => M.filters(ctx)), Kit.btn('Clear all', () => {
      view.filters = M.source.defaults(); view.status = ''; view.area = ''; view.expanded = false; ctx.go('all', ctx.page);
    }), ctx.page === 'requests' && !(M.live && M.live.enabled) ? Kit.btn('New request', () => M.newRequest(ctx), 'dark') : null,
      h('span', { class: 'sub' }, list.length + ' requests'), h('div', { class: 'm-filters sub', style: 'width:100%' }, M.filterSummary(ctx)));
  };
  M.newRequest = function (ctx) {
    M.dialog('New measurement request', close => {
      const draft = { client: '', stage: M.STAGES.find(s => M.stageId(s) === ctx.tab) || M.STAGES[0], date: '', assignee: '', note: '' };
      const clients = ctx.all.filter(c => c.stage !== 'bin' && c.stage !== 'lost');
      const error = h('p', { class: 'm-error', role: 'alert' });
      const input = (label, key, type) => Kit.field(label, Kit.input('', v => { draft[key] = v; }, { label, type }));
      return h('div', null, h('div', { class: 'm-fields' },
        Kit.field('Client', Kit.select(clients.map(c => [c.id, c.name + ' · ' + (c.pid || c.id)]), '', v => { draft.client = v; }, { label: 'Client', placeholder: 'Choose client' })),
        Kit.field('Visit type', Kit.select(M.STAGES, draft.stage, v => { draft.stage = v; }, { label: 'Visit type', placeholder: false })),
        input('Visit date', 'date', 'date'), input('Assigned to', 'assignee'), input('Request note', 'note')), error,
        h('div', { class: 'm-actions' }, Kit.btn('Cancel', close), Kit.btn('Create request', () => {
          const c = clients.find(c => c.id === draft.client), key = M.stageId(draft.stage);
          if (!c) { error.textContent = 'Choose a client.'; return; }
          if (draft.date && (!M.day(draft.date) || draft.date < Kit.today())) { error.textContent = 'Choose today or a future visit date.'; return; }
          if (M.requests([c]).some(r => r.stage === draft.stage)) { error.textContent = 'This client already has this visit type. Open the existing request to reschedule or reopen it.'; return; }
          ctx.update(() => {
            const m = { requestedAt: Kit.now(), changedAt: Kit.now(), date: draft.date, assignee: draft.assignee.trim(), note: draft.note.trim(), by: 'Measurement' };
            if (draft.stage === M.STAGES[0]) c.measurement = m;
            else { c.measurementVisits = c.measurementVisits || {}; c.measurementVisits[key] = m; }
            Kit.news(c, draft.stage + ' requested', 'blue', 'Measurement');
          });
          close(); ctx.show({ id: c.id + ':' + key });
        }, 'dark')));
    });
  };
  M.csv = function (rows) {
    const cell = v => '"' + String(v == null ? '' : v).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
  };
  M.downloadCsv = function (rows, filename) {
    const url = URL.createObjectURL(new Blob([M.csv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  M.workDialog = function (r, ctx, kind) {
    const problem = kind === 'problems';
    M.dialog(problem ? 'Report a problem' : 'Assign a task', close => {
      const draft = { title: '', reason: '', assignee: '', due: '', note: '' }, error = h('p', { class: 'm-error', role: 'alert' });
      const input = (label, key, type) => Kit.field(label, Kit.input('', v => { draft[key] = v; }, { label, type }));
      return h('div', null, h('p', { class: 'sub' }, r.client + ' · ' + r.stage), h('div', { class: 'm-fields' },
        input('Title', 'title'), problem ? input('Reason', 'reason') : null, input('Assigned to', 'assignee'), input('Due date', 'due', 'date'), input('Note', 'note')), error,
        h('div', { class: 'm-actions' }, Kit.btn('Cancel', close), Kit.btn('Save', () => {
          if (!draft.title.trim() || (problem && !draft.reason.trim()) || (!problem && !draft.assignee.trim())) { error.textContent = problem ? 'Enter a title and reason.' : 'Enter a title and assigned person.'; return; }
          if (draft.due && !M.day(draft.due)) { error.textContent = 'Enter a valid due date.'; return; }
          ctx.update(() => { const at = Kit.now(); r.m[kind] = r.m[kind] || []; r.m[kind].push(Object.assign({}, draft, { id: crypto.randomUUID(), status: problem ? 'Open' : 'To Do', createdAt: at, history: [{ at, note: 'Created', status: problem ? 'Open' : 'To Do' }] })); r.m.changedAt = at; });
          close();
        }, 'dark')));
    });
  };
  M.workStatus = function (r, item, ctx, status) {
    M.dialog('Update ' + item.title, close => {
      const cancel = () => { close(); ctx.update(); };
      let note = ''; const error = h('p', { class: 'm-error', role: 'alert' });
      return h('div', null, Kit.field('Reason for change to ' + status, Kit.input('', v => { note = v; }, { label: 'Reason for status change' })), error,
        h('div', { class: 'm-actions' }, Kit.btn('Cancel', cancel), Kit.btn('Save update', () => {
          if (!note.trim()) { error.textContent = 'Add a short note for the history.'; return; }
          ctx.update(() => { const at = Kit.now(); item.status = status; item.history = item.history || []; item.history.push({ at, status, note: note.trim() }); r.m.changedAt = at; }); close();
        }, 'dark')));
    });
  };
})();
