// Design · Post-design · PDI approval: after the final design, the PDI team does the last PDI and Design approves it.
// After the PDI, Accounts gives the factory go-ahead once 80% is in (see Shoot to factory).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  D.pdiWaiting = function (all) { return all.filter(L.handed).filter(function (c) { const f = L.flow(c); return !c.factoryAt && f.design.approvedAt && !f.pdi.approvedAt; }); };
  D.pdiWindow = function (c, ctx) {
    const f = L.flow(c), p = f.pdi;
    return {
      title: c.name,
      tag: Kit.pill(p.approvedAt ? 'PDI approved' : 'PDI waiting', p.approvedAt ? 'green' : 'yellow'),
      sub: c.pid + ' · ' + (c.design.designer ? 'Designer ' + c.design.designer : 'No designer') + ' · design approved ' + (f.design.approvedAt ? Kit.day(f.design.approvedAt) : 'not yet'),
      body: [D.topFacts(c), Kit.card('PDI', '', 'teal',
        h('div', { class: 'facts' },
          h('div', null, h('span', null, 'PDI visits recorded'), h('b', null, String(p.log.filter(function (x) { return x.what === 'PDI visit done'; }).length))),
          h('div', null, h('span', null, 'PDI approved'), h('b', null, p.approvedAt ? Kit.day(p.approvedAt) : 'Not yet')),
          h('div', null, h('span', null, '80% collection'), h('b', null, L.collectionDone(c) ? 'Done' : Kit.short(L.productionRow(c).due) + ' still to come'))),
        h('div', { class: 'flexrow' },
          Kit.btn('PDI visit done', function () { ctx.update(function () { L.flowLog(p, 'PDI visit done'); Kit.news(c, 'PDI visit done', 'blue', 'Design'); }); }, 'line'),
          p.approvedAt ? null : Kit.btn('PDI approved', function () {
            if (!f.design.approvedAt) return;
            ctx.update(function () { p.approvedAt = Kit.now(); L.flowLog(p, 'PDI approved'); Kit.news(c, 'PDI approved', 'green', 'Design'); L.toFactory(c); });
          }, 'dark', { disabled: !f.design.approvedAt })),
        !f.design.approvedAt ? h('div', { class: 'sub' }, 'The final design must be approved first.') : null,
        h('div', { class: 'sub' }, 'Once the PDI is approved and 80% is in, Accounts gives the factory go-ahead; then the order is shot to the factory and the factory is emailed.'))]
    };
  };
  D.pdiMain = function (ctx, all) {
    const rows = D.pdiWaiting(all);
    return h('div', { class: 'onelist' }, Kit.list('PDI approval', h('span', { class: 'sub' }, 'Final design approved · waiting for the last PDI'),
      rows.map(function (c) {
        const n = L.flow(c).pdi.log.filter(function (x) { return x.what === 'PDI visit done'; }).length;
        return { name: c.name, sub: (c.design.designer || 'No designer') + ' · ' + (c.sm || People.owner(c)) + ' · ' + Kit.short(L.totals(c).total) + ' · design approved ' + Kit.day(L.flow(c).design.approvedAt),
          pill: Kit.pill(n ? n + ' PDI visit(s)' : 'PDI not done', n ? 'yellow' : 'red'), pick: function () { ctx.show({ kind: 'pdi', id: c.id }); } };
      }), 'Nothing waiting for PDI.'));
  };
})();
