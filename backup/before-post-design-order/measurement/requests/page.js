// Measurement · Requests: every request, with the status filter and the sort.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const M = window.MeasurementParts;
  const view = M.view, STAGES = M.STAGES, short = M.short;
  const requests = M.requests, count = M.count, pill = M.pill, row = M.row, bars = M.bars, grouped = M.grouped;

  M.pages = M.pages || {};
  M.pages['requests'] = function (ctx, list, n, stats) {
        const shown = list.filter(function (r) { return !view.status || (view.status === 'Open' ? r.status !== 'Done' : (view.status === 'Late' ? r.late : r.status === view.status)); })
          .sort(function (a, b) { return view.sort === 'client' ? (a.c.name < b.c.name ? -1 : 1) : (view.sort === 'visit' ? ((a.date || '9999') < (b.date || '9999') ? -1 : 1) : (a.changed < b.changed ? 1 : -1)); });
        return [stats, h('div', { class: 'onelist' }, Kit.list('Requests',
          h('div', { class: 'flexrow' },
            h('div', { style: 'width: 160px' }, Kit.select(['Open', 'Scheduled', 'To Schedule', 'Late', 'Done'], view.status, function (v) { view.status = v; ctx.update(); }, { placeholder: 'All statuses', label: 'Status' })),
            h('div', { style: 'width: 170px' }, Kit.select([['recent', 'Recently changed'], ['client', 'Client name'], ['visit', 'Visit date']], view.sort, function (v) { view.sort = v; ctx.update(); }, { placeholder: false, label: 'Sort' }))),
          shown.map(function (r) { return row(r, ctx); }), 'No requests match.'))];
  };
})();
