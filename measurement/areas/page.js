// Measurement · Map and areas: requests grouped by city, sales person or assigned person.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const M = window.MeasurementParts;
  const view = M.view, STAGES = M.STAGES, short = M.short;
  const requests = M.requests, count = M.count, pill = M.pill, row = M.row, bars = M.bars, grouped = M.grouped;

  M.pages = M.pages || {};
  M.pages['areas'] = function (ctx, list, n, stats) {
        const groups = grouped(list, view.group);
        return [stats, h('div', { class: 'twolists' },
          Kit.list('Areas', h('div', { style: 'width: 150px' }, Kit.select([['city', 'By city'], ['owner', 'By sales person'], ['assignee', 'By assigned person']], view.group, function (v) { view.group = v; ctx.update(); }, { placeholder: false, label: 'Group by' })),
            groups.map(function (g) { const k = count(g.items); return { name: g.name, sub: k.Open + ' open · ' + k.Scheduled + ' scheduled · ' + k['To Schedule'] + ' to schedule · ' + k.Done + ' done', pill: Kit.pill(g.items.length + ' request(s)', k.Late ? 'red' : 'grey'), pick: function () {} }; }),
            'No requests yet.'),
          Kit.card('Map', '', 'grey', h('div', null, 'The live map is not connected in this CRM yet.'),
            h('div', { class: 'sub' }, 'The Measurement Dashboard project draws it with Mappls and each site\'s exact coordinates. Here the same requests are grouped by city on the left. Nothing is placed on a map from a guess.')))];
  };
})();
