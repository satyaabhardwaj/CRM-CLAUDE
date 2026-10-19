// Accounts · Booking tab: payments expected, payments Sales says have come (to confirm), and bookings to approve.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  A.bookingCount = function (all) { return all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && L.bookingLeft(c) > 0; }).length; };
  A.bookingMain = function (ctx) {
    const pays = [];
    // Only clients still in play: one that Sales has deleted or lost must not ask Accounts for anything.
    ctx.all.filter(A.inPlay).forEach(function (c) { c.payment.receipts.forEach(function (r) { if (r.status === 'Requested') pays.push({ c: c, r: r }); }); });
    pays.sort(function (a, b) { return new Date(a.r.requestedAt || 0) - new Date(b.r.requestedAt || 0); });
    const books = ctx.all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && c.approvals.booking === 'Pending'; });
    const owing = ctx.all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && L.bookingLeft(c) > 0; })
      .map(function (c) { const by = L.payDue(c); return { c: c, by: by, late: by ? Math.round((new Date(Kit.today()) - new Date(by)) / 86400000) : 0 }; })
      .sort(function (a, b) { return (a.by || '9999') < (b.by || '9999') ? -1 : 1; });
    return h('div', { class: 'twolists', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
      Kit.list('Payments expected', null,
        owing.map(function (x) {
          const c = x.c;
          const amount = !L.tokenIn(c) ? (Number(c.payment.tokenPlan) || L.bookingLeft(c)) : L.bookingLeft(c);
          return { name: c.name + ' · ' + Kit.short(amount), sub: People.owner(c) + ' · ' + (!L.tokenIn(c) ? (Kit.bankOnly() ? 'first payment' : 'token') : 'rest of booking amount') + ' · received ' + Kit.short(L.collected(c)),
            pill: Kit.pill(!x.by ? 'No date' : (x.late > 0 ? x.late + ' day(s) overdue' : (x.late === 0 ? 'Due today' : 'Due ' + Kit.day(x.by).replace(/ \d{4}$/, ''))), x.late > 0 ? 'red' : 'grey'),
            pick: function () { ctx.show({ kind: 'expected', id: c.id }); } };
        }), 'No payments are expected.'),
      Kit.list('Sales says paid · to confirm', null,
        pays.map(function (x) {
          return { name: x.c.name, sub: People.owner(x.c) + ' · ' + (x.r.mode || 'Mode not given') + (x.r.ref ? ' · ' + x.r.ref : '') + ' · ' + Kit.day(x.r.date),
            pill: Kit.pill(Kit.short(x.r.amount), 'blue'), pick: function () { ctx.show({ kind: 'payment', id: x.c.id, at: x.r.requestedAt }); } };
        }), 'Nothing from Sales to confirm.'),
      Kit.list('Bookings to approve', null,
        books.map(function (c) {
          return { name: c.name, sub: People.owner(c) + ' · ' + Kit.short(L.totals(c).total) + ' · ' + c.payment.plan + ' plan · collected ' + Kit.short(L.collected(c)),
            pill: Kit.pill('Pending', 'blue'), pick: function () { ctx.show({ kind: 'booking', id: c.id }); } };
        }), 'No bookings are waiting.'));
  };
})();
