// Measurement · Overview: the counts, what needs a date, the four stages, upcoming visits and recent changes.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const M = window.MeasurementParts;
  const view = M.view, STAGES = M.STAGES, short = M.short;
  const requests = M.requests, count = M.count, pill = M.pill, row = M.row, bars = M.bars, grouped = M.grouped;

  M.pages = M.pages || {};
  M.pages['overview'] = function (ctx, list, n, stats) {
        const upcoming = list.filter(function (r) { return r.status === 'Scheduled'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        const recent = list.slice().sort(function (a, b) { return a.changed < b.changed ? 1 : -1; }).slice(0, 12);
        const every = requests(ctx.all);
        return [stats,
          n.Late || n['To Schedule'] ? h('div', { class: 'card', style: 'padding: 12px 16px; flex: none' }, h('b', null, (n.Late ? n.Late + ' visit(s) late. ' : '') + (n['To Schedule'] ? n['To Schedule'] + ' request(s) need a visit date.' : ''))) : null,
          h('div', { class: 'twolists', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
            Kit.list('Measurement stages', null, STAGES.map(function (s) {
              const k = count(every.filter(function (r) { return r.stage === s; }));
              return { name: s, sub: k.Open + ' open · ' + k.Scheduled + ' scheduled · ' + k['To Schedule'] + ' to schedule · ' + k.Done + ' done', pill: Kit.pill(k.Open + ' open', k.Late ? 'red' : 'grey'), pick: function () { ctx.go(s.toLowerCase().replace(/ /g, '-'), 'requests'); } };
            }), ''),
            Kit.list('Upcoming visits', null, upcoming.map(function (r) { return row(r, ctx); }), 'No visits are booked.'),
            Kit.list('Recently changed', null, recent.map(function (r) { return row(r, ctx); }), 'No requests yet.'))];
  };
})();
