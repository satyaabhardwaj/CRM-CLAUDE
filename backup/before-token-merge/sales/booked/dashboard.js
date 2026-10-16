// Dashboard 4 · Booked, collecting. Token is in. The client stays with the SM until the booking share is collected.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const P = SalesPieces;

  function state(c) {
    if (L.bookingLeft(c) === 0) return ['Booking share collected', 'green'];
    const by = c.payment.expectedBy;
    if (by && by < Kit.today()) return ['Payment overdue', 'red'];
    return ['Collecting', 'grey'];
  }

  function table(ctx) {
    // Rejected by Accounts first, then the biggest amount left.
    const bad = function (c) { return c.approvals.booking === 'Rejected' ? 0 : 1; };
    const rows = ctx.clients.slice().sort(function (a, b) { return (bad(a) - bad(b)) || (L.bookingLeft(b) - L.bookingLeft(a)); });
    return Sales.table({
      ctx: ctx,
      title: 'Booked · collecting',
      cols: '1.6fr 1fr 0.6fr 1fr 1fr 1fr 1.2fr 0.9fr 1.1fr',
      heads: ['Client', 'Order value', 'Plan', 'Booking share', 'Collected', 'Left', 'Progress', 'Expected by', 'Accounts'],
      empty: 'No booked clients are collecting right now.',
      rows: rows.map(function (c) {
        const due = L.bookingDue(c);
        const got = L.collected(c);
        const pct = due ? Math.min(100, Math.round(got / due * 100)) : 0;
        return { id: c.id, cells: [[h('b', null, c.name), ' ', h('span', { class: 'sub' }, c.pid)],
          h('span', { class: 'num' }, Kit.money(L.totals(c).total)), c.payment.plan,
          h('span', { class: 'num' }, Kit.money(due)), h('span', { class: 'num' }, Kit.money(got)), h('span', { class: 'num' }, Kit.money(L.bookingLeft(c))),
          h('span', { style: 'display: flex; align-items: center; gap: 8px' }, h('span', { class: 'bar', style: 'flex: 1' }, h('i', { style: 'width: ' + pct + '%' })), h('span', { class: 'sub' }, pct + '%')),
          c.payment.expectedBy ? Kit.day(c.payment.expectedBy).replace(/ \d{4}$/, '') : 'Not set',
          Kit.pill({ 'Not sent': 'Not sent', Pending: 'With Accounts', Approved: 'Approved', Rejected: 'Rejected' }[c.approvals.booking], { 'Not sent': 'grey', Pending: 'blue', Approved: 'green', Rejected: 'red' }[c.approvals.booking])] };
      })
    });
  }

  function sheet(c, ctx) {
    const s = state(c);
    const done = L.bookingLeft(c) === 0;
    return [
      P.header(c, ctx, Kit.pill(s[0], s[1])),
      h('section', { class: 'card', style: 'padding: 10px 16px; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px' },
        h('div', { style: 'font-size: 13px' }, h('b', null, 'Collected ' + Kit.money(L.collected(c)) + ' of ' + Kit.money(L.bookingDue(c))),
          h('span', { class: 'sub' }, done ? ' · the booking share is in' : ' · ' + Kit.money(L.bookingLeft(c)) + ' left before this client moves on')),
        Kit.btn('Move to post-design', function () { ctx.update(function () { c.stage = 'post'; c.movedAt = Kit.now(); }); }, 'dark', { disabled: !done }))
    ].concat(SalesCards.render(c, ctx));
  }

  Sales.register({ id: 'booked', title: 'Booked · collecting', short: 'Booked', table: table, sheet: sheet,
    summary: function (list) {
      const left = list.reduce(function (t, c) { return t + L.bookingLeft(c); }, 0);
      const got = list.reduce(function (t, c) { return t + L.collected(c); }, 0);
      return Kit.short(left) + ' to collect · ' + Kit.short(got) + ' collected';
    } });
})();
