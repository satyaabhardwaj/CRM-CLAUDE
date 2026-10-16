// Dashboard 3 · Token due. The client signed the design and the quotation. The token has not come yet.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const P = SalesPieces;

  function tokenState(c) {
    if (c.payment.receipts.some(function (r) { return r.status === 'Requested'; })) return ['With Accounts', 'blue'];
    const no = c.payment.receipts.filter(function (r) { return r.status === 'Rejected'; }).pop();
    if (no) return ['Rejected · ' + (no.reason || 'see payment'), 'red'];
    // Late is counted from the token date the sales person gave. With no date, from two days after approval.
    const by = c.payment.tokenBy;
    const late = by ? Math.round((new Date(Kit.today()) - new Date(by)) / 86400000) : Kit.daysSince(c.approvedAt) - 1;
    return late > 0 ? ['Token ' + late + ' day(s) late', 'red'] : [by ? 'Token due ' + Kit.day(by).replace(/ \d{4}$/, '') : 'Token to collect', 'grey'];
  }

  function table(ctx) {
    // Rejected by Accounts first, then waiting on Accounts, then not sent yet.
    const rank = function (c) { const t = tokenState(c)[0]; return t.indexOf('Rejected') === 0 ? 0 : (t === 'With Accounts' ? 1 : 2); };
    const rows = ctx.clients.slice().sort(function (a, b) { return (rank(a) - rank(b)) || (new Date(a.approvedAt || 0) - new Date(b.approvedAt || 0)); });
    const times = function (n) { return n + (n === 1 ? ' time' : ' times'); };
    const approvals = Kit.list('Accounts approval', null,
      rows.map(function (c) {
        const state = tokenState(c);
        const sent = c.payment.receipts.length;
        const no = c.payment.receipts.filter(function (r) { return r.status === 'Rejected'; }).length;
        const last = c.payment.receipts[c.payment.receipts.length - 1];
        return { id: c.id, name: c.name,
          sub: (last ? 'Token ' + Kit.money(last.amount) + ' · sent ' + times(sent) + ' · rejected ' + times(no) : 'Token not sent yet') + ' · order ' + Kit.money(L.totals(c).total),
          pill: Kit.pill(state[0], state[1]), mark: rank(c) === 0 ? 'bad' : (rank(c) === 1 ? 'new' : ''),
          on: ctx.isOpen && ctx.selected && ctx.selected.id === c.id, pick: function () { ctx.select(c.id); } };
      }), 'No tokens are due right now.', SalesBin.clients(ctx));
    return h('div', { class: 'twolists' }, SalesLists.followUps(ctx, 'token', 'Calls and follow-ups'), approvals);
  }

  function sheet(c, ctx) {
    const state = tokenState(c);
    return [P.header(c, ctx, Kit.pill(state[0], state[1]))].concat(SalesCards.render(c, ctx));
  }

  Sales.register({ id: 'token', title: 'Token due', short: 'Token', table: table, sheet: sheet,
    summary: function (list) {
      const due = list.reduce(function (t, c) { return t + L.bookingDue(c); }, 0);
      const no = list.filter(function (c) { return tokenState(c)[0].indexOf('Rejected') === 0; }).length;
      const wait = list.filter(function (c) { return tokenState(c)[0] === 'With Accounts'; }).length;
      return Kit.short(due) + ' due · ' + wait + ' with Accounts · ' + no + ' rejected';
    } });
})();
