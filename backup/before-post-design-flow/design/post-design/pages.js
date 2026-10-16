// Design · Post-design: the pages on the left once Design is the point of contact
// (production drawing, collect 30%, collections, order tracker), and what each shows.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, POST = D.POST, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  // The list of pages, with their counts.
  D.postPages = function (all) {
        const mine = all.filter(L.handed);
        const at = function (name) { return mine.filter(function (c) { return L.postStage(c) === name; }).length; };
        return [
          { id: 'production-drawing', title: 'Production drawing', short: 'Drawing', count: at('Production drawing'), summary: 'Final drawing to be signed off' },
          { id: 'collect-30%', title: 'Collect 30%', short: '30%', count: at('Collect 30%'), summary: 'Drawing signed off, payment still to come' },
          { id: 'collections', title: 'Collections', short: 'Collect', count: mine.filter(function (c) { return owed(c) > 0; }).length,
            summary: Kit.short(mine.reduce(function (t, c) { return t + owed(c); }, 0)) + ' still to collect after booking' },
          { id: 'tracker', title: 'Order tracker', short: 'Tracker', count: mine.length, summary: at('Factory') + ' in factory · ' + at('Dispatch') + ' dispatched · ' + at('Handed over') + ' handed over' }
        ];
  };

  // The main area for a post-design page.
  D.postMain = function (ctx, all, see) {
      if (ctx.page === 'tracker') return D.trackerTable(all.filter(L.handed), see);
      if (ctx.page === 'collections') {
        // Collections: the money Design has to bring in after booking, client by client, biggest first.
        const rows = all.filter(L.handed).filter(function (c) { return owed(c) > 0; }).sort(function (a, b) { return owed(b) - owed(a); });
        const next = function (c) { return L.ledger(c).filter(function (r) { return r.name !== 'Booking' && r.due > 0; })[0]; };
        return h('div', { class: 'onelist' }, Kit.list('Collections', h('span', { class: 'sub' }, Kit.short(rows.reduce(function (t, c) { return t + owed(c); }, 0)) + ' to collect from ' + rows.length + ' client(s)'),
          rows.map(function (c) {
            const t = L.totals(c), n = next(c);
            return { name: c.name + ' · ' + Kit.short(owed(c)),
              sub: (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') + ' · order ' + Kit.short(t.total) + ' · received ' + Kit.short(L.collected(c)) + ' (' + Math.round(L.collected(c) / t.total * 100) + '%) · ' +
                L.ledger(c).filter(function (r) { return r.name !== 'Booking'; }).map(function (r) { return r.name + ' ' + r.percent + '%: ' + (r.due ? Kit.short(r.due) + ' due' : 'paid'); }).join(' · '),
              pill: Kit.pill(n ? 'Next: ' + n.name + ' ' + Kit.short(n.due) : 'All in', 'red'), pick: see(c) };
          }), 'Nothing left to collect from post-design clients.'));
      } else {
        const mine = all.filter(L.handed).filter(function (c) { return ctx.page === 'all' || L.postStage(c).toLowerCase().replace(/ /g, '-') === ctx.page; });
        const title = ctx.page === 'all' ? 'All post-design clients' : (POST.filter(function (n) { return n.toLowerCase().replace(/ /g, '-') === ctx.page; })[0] || 'Post-design');
        return h('div', { class: 'onelist' }, Kit.list(title, h('span', { class: 'sub' }, 'Design is the point of contact · collect the 30% after the final drawing signoff, then it goes to the Factory'),
          mine.map(function (c) {
            const d = L.dates(c), t = L.totals(c);
            return { name: c.name, sub: (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') + ' · ' + People.owner(c) + ' · ' + c.city +
                (d ? ' · signoff ' + short(d.signoff) + ' · PDI ' + short(d.pdi) + ' · dispatch ' + short(d.dispatch) + ' · handover ' + short(d.handover) : ' · no handover date') +
                (t.total ? ' · paid ' + Math.round(L.collected(c) / t.total * 100) + '%' : '') +
                (L.productionRow(c) && L.productionRow(c).due > 0 ? ' · 30% to collect ' + Kit.short(L.productionRow(c).due) : ''),
              pill: Kit.pill(L.postStage(c), L.postStage(c) === 'Collect 30%' ? 'red' : (L.postStage(c) === 'Factory' || L.postStage(c) === 'Handed over' ? 'green' : 'blue')), pick: see(c) };
          }), 'No clients at this stage.'));
      }
  };
})();
