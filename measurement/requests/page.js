(function () {
  const M = MeasurementParts, h = Kit.h, view = M.view;
  M.pages = M.pages || {};
  M.pages.requests = function (ctx, list, n, stats) {
    const sorted = M.source.sort(list, view.sort), shown = view.expanded ? sorted : sorted.slice(0, 10);
    const cell = (label, value) => h('td', { 'data-label': label }, value);
    return [stats, h('div', { class: 'm-toolbar' },
      Kit.select([['recent', 'Recently changed'], ['client', 'Client name'], ['visit', 'Visit date']], view.sort, v => { view.sort = v; ctx.update(); }, { placeholder: false, label: 'Sort requests' }),
      Kit.btn('Export requests CSV', () => M.downloadCsv([['Client', 'Project', 'Visit type', 'Status', 'Visit date', 'City', 'State', 'Zone', 'Sales person', 'Assigned to'], ...sorted.map(r => [r.client, r.order, r.stage, r.late ? 'Late' : r.status, r.date, r.city, r.state, r.zone, r.owner, r.assignee])], 'measurement-requests.csv')),
      h('span', { class: 'sub' }, shown.length + ' of ' + sorted.length)),
      h('div', { class: 'm-table-wrap', 'data-keep': 'measurement-requests' },
        shown.length ? h('table', { class: 'm-table' }, h('caption', null, 'Measurement requests'),
          h('thead', null, h('tr', null, ['Client', 'Visit type', 'Location', 'Assigned to', 'Visit date', 'Status', 'Details'].map(s => h('th', { scope: 'col' }, s)))),
          h('tbody', null, shown.map(r => h('tr', null,
            cell('Client', h('div', null, h('b', null, r.client), h('div', { class: 'sub' }, r.order))),
            cell('Visit type', r.stage), cell('Location', [r.city, r.state].filter(Boolean).join(', ') || 'Not provided'),
            cell('Assigned to', r.assignee || 'Not assigned'), cell('Visit date', r.date ? Kit.day(r.date) : 'Not scheduled'), cell('Status', M.pill(r)),
            cell('Details', Kit.btn('View', () => ctx.show({ id: r.id }), 'small', { 'aria-label': 'View ' + r.client + ' ' + r.stage })))))) : h('div', { class: 'empty' }, 'No requests match. Clear filters or create a request for an existing client.')),
      sorted.length > 10 ? Kit.btn(view.expanded ? 'Show fewer' : 'Show all ' + sorted.length + ' records', () => { view.expanded = !view.expanded; ctx.update(); }) : null];
  };
})();
