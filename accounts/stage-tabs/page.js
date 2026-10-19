// Accounts · EPT, Production drawing, PDI and Handover tabs: who has to pay at that stage now, who will later, and who has.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  A.stageCount = function (all, st) { return all.filter(function (c) { if (!A.inPlay(c) || !c.order.products.length) return false; const row = A.line(c, st[2]); return row && row.now; }).length; };
  A.stageMain = function (ctx, stage) {
    const rows = ctx.all.filter(function (c) { return A.inPlay(c) && c.order.products.length; })
      .map(function (c) { return { c: c, x: A.line(c, stage[2]) }; }).filter(function (r) { return r.x; });
    const when = function (r) { return r.x.by ? Kit.day(r.x.by).replace(/ \d{4}$/, '') : 'No date'; };
    const late = function (r) { return r.x.by && r.x.by < Kit.today(); };
    const item = function (r, pill) {
      return { name: r.c.name + ' · ' + Kit.short(r.x.due || r.x.amount), sub: People.owner(r.c) + ' · ' + r.c.payment.plan + ' plan · ' + r.x.percent + '% of ' + Kit.short(L.totals(r.c).total) + ' · paid ' + Kit.short(r.x.paid),
        pill: pill, pick: function () { ctx.show({ kind: 'expected', id: r.c.id }); } };
    };
    const now = rows.filter(function (r) { return r.x.now; }).sort(function (a, b) { return (a.x.by || '9999') < (b.x.by || '9999') ? -1 : 1; });
    const soon = rows.filter(function (r) { return !r.x.now && !r.x.done; });
    const done = rows.filter(function (r) { return r.x.done; });
    return h('div', { class: 'twolists', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
      Kit.list(stage[1] + ' payment due now', null, now.map(function (r) { return item(r, Kit.pill(late(r) ? 'Overdue · ' + when(r) : 'Due ' + when(r), late(r) ? 'red' : 'grey')); }), 'Nobody has to pay at this stage right now.'),
      Kit.list('Coming up', null, soon.map(function (r) { return item(r, Kit.pill('An earlier stage is unpaid', 'grey')); }), 'Nothing coming up.'),
      Kit.list('Received', null, done.map(function (r) { return item(r, Kit.pill('Paid', 'green')); }), 'Nothing received at this stage yet.'));
  };
})();
