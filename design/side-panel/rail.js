// Design · the column on the right: waiting 3 days or more, promised to Sales, money to collect, just in.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, POST = D.POST, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  D.rail = function (ctx, all) {
      const box = function (title, tone, items, empty) {
        return h('section', { class: 'card' }, h('div', { class: 'card-h t-' + tone }, h('h2', null, title), h('span', null, items.length || '')),
          items.length ? items.slice(0, 3).map(function (x) {
            return h('button', { type: 'button', class: 'item', onclick: function () { ctx.show({ kind: x.kind, id: x.c.id }); } },
              h('span', { class: 'line' }, h('b', null, x.c.name), x.pill), h('span', { class: 'sub' }, x.sub));
          }) : h('div', { class: 'item', style: 'cursor: default' }, h('span', { class: 'sub' }, empty)));
      };
      const todo = tasks(all);
      const waiting = todo.filter(function (t) { return Kit.daysSince(t.at) >= 3; }).map(function (t) { return { c: t.c, kind: t.kind, pill: Kit.pill(Kit.daysSince(t.at) + ' days', 'red'), sub: t.what.replace(/ · .*$/, '') + ' · ' + (t.c.design.designer || 'No designer') }; });
      const promised = all.filter(function (c) { return c.stage === 'design' && c.design.step === 'withDesign' && c.design.promisedBy; }).sort(function (a, b) { return a.design.promisedBy < b.design.promisedBy ? -1 : 1; })
        .map(function (c) { const late = c.design.promisedBy < Kit.today(); return { c: c, kind: 'proposal', pill: Kit.pill(short(c.design.promisedBy), late ? 'red' : 'grey'), sub: (late ? 'Promise date passed' : 'Promised to Sales') + ' · ' + (c.design.designer || 'No designer') }; });
      const money = all.filter(L.handed).filter(function (c) { return owed(c) > 0; }).sort(function (a, b) { return owed(b) - owed(a); })
        .map(function (c) { return { c: c, kind: 'client', pill: Kit.pill(Kit.short(owed(c)), 'red'), sub: 'received ' + Math.round(L.collected(c) / L.totals(c).total * 100) + '% · ' + L.postStage(c) }; });
      const fresh = all.filter(function (c) { return (c.news || []).some(function (n) { return Kit.newsFrom(n) !== 'Design' && Kit.hoursSince(n.at) <= 48; }); })
        .map(function (c) { const n = c.news.filter(function (x) { return Kit.newsFrom(x) !== 'Design'; })[0]; return { c: c, kind: L.handed(c) ? 'client' : (c.design.step === 'withDesign' ? 'proposal' : 'client'), pill: Kit.pill(Kit.newsFrom(n), 'blue'), sub: n.text }; });
      if (ctx.tab === 'post') {
        const pdi = D.pdiWaiting(all).map(function (c) { return { c: c, kind: 'pdi', pill: Kit.pill('PDI', 'yellow'), sub: 'ready since ' + Kit.day(D.pdiSince(c)) + ' · ' + (c.design.designer || 'No designer') }; });
        const fac = D.factoryWaiting(all).map(function (c) { return { c: c, kind: 'client', pill: Kit.pill(Kit.short(L.productionRow(c) ? L.productionRow(c).due : 0), 'red'), sub: 'PDI approved · waiting for 80% or Accounts' }; })
          .concat(D.factoryGone(all).sort(function (a, b) { return a.factoryAt < b.factoryAt ? 1 : -1; }).map(function (c) { return { c: c, kind: 'client', pill: Kit.pill('Sent', 'green'), sub: 'since ' + Kit.day(c.factoryAt) + ' · ' + D.mailLine(c) }; }));
        return [box('PDI approval', 'teal', pdi, 'Nothing waiting for PDI.'), box('Shoot to factory', 'green', fac, 'Nothing for the factory yet.'),
          box('Money to collect', 'amber', money, 'Nothing to collect.'), box('Just in', 'blue', fresh, 'Nothing new from Sales or Accounts.')];
      }
      return [box('Waiting 3 days or more', 'amber', waiting, 'Nothing is waiting long.'), box('Promised to Sales', 'violet', promised, 'No promise dates given.'),
        box('Money to collect', 'green', money, 'Nothing to collect.'), box('Just in', 'blue', fresh, 'Nothing new from Sales or Accounts.')];
  };
})();
