// Accounts · the frame: the slim tabs on top and which page each one shows.
// Summary, Clients, Daily payments and Approvals first, then the payment stages (Booking, EPT, Production drawing, PDI, Handover),
// then Master data (not in the bank-only view). Every decision shows on the sales person's and Design's screens by itself.
(function () {
  const L = SalesLogic;
  const A = window.AccountsParts;
  Kit.app({
    id: 'accounts',
    title: 'Accounts',
    // Installation and PDI have no screen of their own yet, so their columns stay empty for now.
    hears: ['Sales', 'Design', 'Measurement', 'Installation', 'PDI'],
    tabs: function (all) {
      return [{ id: 'summary', label: 'Summary' }, { id: 'clients', label: 'Clients', count: all.filter(A.hasOrder).length },
        { id: 'daily', label: 'Daily payments' }, { id: 'approvals', label: 'Approvals', count: A.approvalsCount(all) }]
        .concat(A.STAGES.map(function (st) { return { id: st[0], label: st[1], count: st[0] === 'booking' ? A.bookingCount(all) : A.stageCount(all, st) }; }))
        .concat(Kit.bankOnly() ? [] : [{ id: 'master', label: 'Master data' }]);
    },
    build: function (ctx) {
      // Master data lives here and nowhere else.
      if (ctx.tab === 'master' && !Kit.bankOnly()) return { main: Master.table(ctx.all), window: null };
      const c = ctx.open ? ctx.all.find(function (x) { return x.id === ctx.open.id; }) : null;
      let win = null;
      if (c && ctx.open.kind === 'booking') win = A.bookingWindow(c, ctx);
      if (c && ctx.open.kind === 'expected') win = A.expectedWindow(c, ctx);
      if (c && ctx.open.kind === 'payment') {
        const r = c.payment.receipts.find(function (x) { return x.requestedAt === ctx.open.at && x.status === 'Requested'; });
        if (r) win = A.paymentWindow(c, r, ctx);
      }
      const PAGES = { summary: A.summaryMain, clients: A.clientsMain, daily: A.dailyMain, approvals: A.approvalsMain, booking: A.bookingMain };
      const stage = A.STAGES.filter(function (x) { return x[0] === ctx.tab; })[0];
      const main = PAGES[ctx.tab] ? PAGES[ctx.tab](ctx) : A.stageMain(ctx, stage || A.STAGES[0]);
      return { main: main, window: win };
    }
  });
})();
