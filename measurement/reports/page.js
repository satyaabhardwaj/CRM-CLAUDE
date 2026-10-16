// Measurement · Reports: key numbers and bar charts by visit type, status, people and city.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const M = window.MeasurementParts;
  const view = M.view, STAGES = M.STAGES, short = M.short;
  const requests = M.requests, count = M.count, pill = M.pill, row = M.row, bars = M.bars, grouped = M.grouped;

  M.pages = M.pages || {};
  M.pages['reports'] = function (ctx, list, n, stats) {
        const open = list.filter(function (r) { return r.status !== 'Done'; });
        const soon = open.filter(function (r) { return r.date && r.date >= Kit.today() && r.date <= Kit.addDays(Kit.today(), 7); }).length;
        const key = h('div', { class: 'statrow' },
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Late'), h('b', { class: 'num' + (n.Late ? ' bad' : '') }, n.Late)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Next 7 days'), h('b', { class: 'num' }, soon)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'No date yet'), h('b', { class: 'num' }, open.filter(function (r) { return !r.date; }).length)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Not assigned'), h('b', { class: 'num' }, open.filter(function (r) { return !r.assignee; }).length)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Done'), h('b', { class: 'num' }, n.Done)));
        const by = function (k) { return grouped(list, k).map(function (g) { return [g.name, g.items.length]; }); };
        return [key, h('div', { class: 'cols', style: 'overflow-y: auto' },
          bars('By visit type', '', STAGES.map(function (s) { return [s, requests(ctx.all).filter(function (r) { return r.stage === s; }).length]; }), ''),
          bars('By status', '', [['Scheduled', n.Scheduled], ['To schedule', n['To Schedule']], ['Late', n.Late], ['Done', n.Done]], ''),
          bars('Work by assigned person', '', by('assignee'), 'No requests yet.'),
          bars('Work by sales person', '', by('owner'), 'No requests yet.'),
          bars('Top cities', '', by('city'), 'No requests yet.'))];
  };
})();
