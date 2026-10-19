// Accounts · Summary: the order book in one screen, like the Accounts sheet's summary tab.
// Order book by where the order is (OCF pending, with Design, in production, dispatched, cancelled), retail and project apart,
// and the money: total payable, received (bank and management), balance, and what is still needed for 50%, 80% and 100%.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  // Where an order is, for the order book.
  A.bookOf = function (c) {
    if ((c.stage === 'lost' || c.stage === 'bin') && c.bookedAt) return 'Cancelled';
    if (!A.inPlay(c)) return '';
    if (L.gateOpen(c, 'dispatch')) return 'Dispatched';
    if (c.factoryAt) return 'In production';
    if (L.handed(c)) return 'With Design';
    return c.ocfReceived ? 'Booked · OCF in' : 'OCF pending';
  };
  A.summaryMain = function (ctx) {
    const orders = ctx.all.filter(function (c) { return c.order.products.length && L.totals(c).total > 0 && A.bookOf(c); });
    const live = orders.filter(function (c) { return A.bookOf(c) !== 'Cancelled'; });
    const obv = function (list) { return list.reduce(function (n, c) { return n + L.totals(c).base; }, 0); };
    const type = function (c) { return c.order.type || 'Retail'; };
    const ROWS = ['OCF pending', 'Booked · OCF in', 'With Design', 'In production', 'Dispatched', 'Cancelled'];
    const grid = 'grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr)) minmax(0, 0.6fr)';
    const book = h('section', { class: 'card' },
      h('div', { class: 'card-h t-blue' }, h('h2', null, 'Order book · offer basic value'), h('span', null, '₹ lakhs')),
      h('div', { class: 'card-b' },
        h('div', { class: 'board-row head', style: grid }, ['Where', 'Retail', 'Project', 'Total', 'Orders'].map(function (t) { return h('div', null, h('b', null, t)); })),
        ROWS.map(function (r) {
          const list = orders.filter(function (c) { return A.bookOf(c) === r; });
          return h('div', { class: 'board-row', style: grid }, h('b', null, r),
            h('span', { class: 'num' }, Kit.lakh(obv(list.filter(function (c) { return type(c) === 'Retail'; })))),
            h('span', { class: 'num' }, Kit.lakh(obv(list.filter(function (c) { return type(c) === 'Project'; })))),
            h('b', { class: 'num' }, Kit.lakh(obv(list))), h('span', { class: 'num' }, String(list.length)));
        }),
        h('div', { class: 'board-row', style: grid + '; border-top: 2px solid var(--ink)' }, h('b', null, 'Total (not cancelled)'),
          h('b', { class: 'num' }, Kit.lakh(obv(live.filter(function (c) { return type(c) === 'Retail'; })))),
          h('b', { class: 'num' }, Kit.lakh(obv(live.filter(function (c) { return type(c) === 'Project'; })))),
          h('b', { class: 'num' }, Kit.lakh(obv(live))), h('b', { class: 'num' }, String(live.length)))));
    const ms = live.map(A.money);
    const add = function (f) { return ms.reduce(function (n, m) { return n + f(m); }, 0); };
    const toPct = function (key) { return live.reduce(function (n, c) { const g = L.gate(c, key); return n + g.short; }, 0); };
    const money = Kit.card('Money · all live orders', '₹ lakhs', 'green',
      h('div', { class: 'facts' },
        A.fact('Total payable', Kit.short(add(function (m) { return m.t.total; }))), A.fact('Received', Kit.short(add(function (m) { return m.paid; }))),
        A.fact('Bank · received of due', Kit.short(add(function (m) { return m.bankGot; })) + ' of ' + Kit.short(add(function (m) { return m.t.bank; }))),
        Kit.bankOnly() ? null : A.fact('Management · received of due', Kit.short(add(function (m) { return m.mgmtGot; })) + ' of ' + Kit.short(add(function (m) { return m.t.mgmt; }))),
        A.fact('Balance', Kit.short(add(function (m) { return m.balance; }))),
        A.fact('Still to come in bank', Kit.short(add(function (m) { return m.bankDue; }))),
        Kit.bankOnly() ? null : A.fact('Still to come as management', Kit.short(add(function (m) { return m.mgmtDue; }))),
        A.fact('Needed to reach the booking share (50%)', Kit.short(toPct('design'))),
        A.fact('Needed to reach 80% (production)', Kit.short(toPct('drawing'))),
        A.fact('Needed to reach 100% (dispatch)', Kit.short(toPct('dispatch')))));
    // Dispatched orders, month by month, from the day Accounts approved dispatch.
    const months = {};
    orders.filter(function (c) { return L.gateOpen(c, 'dispatch'); }).forEach(function (c) {
      const k = c.gates.dispatch.at.slice(0, 7); months[k] = months[k] || { Retail: 0, Project: 0 }; months[k][type(c)] += L.totals(c).base;
    });
    const keys = Object.keys(months).sort();
    const g3 = 'grid-template-columns: minmax(0, 1.2fr) repeat(3, minmax(0, 1fr))';
    const disp = h('section', { class: 'card' },
      h('div', { class: 'card-h t-violet' }, h('h2', null, 'Dispatched by month'), h('span', null, '₹ lakhs')),
      h('div', { class: 'card-b' },
        h('div', { class: 'board-row head', style: g3 }, ['Month', 'Retail', 'Project', 'Total'].map(function (t) { return h('div', null, h('b', null, t)); })),
        keys.length ? keys.map(function (k) {
          const m = months[k];
          return h('div', { class: 'board-row', style: g3 }, h('b', null, new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })),
            h('span', { class: 'num' }, Kit.lakh(m.Retail)), h('span', { class: 'num' }, Kit.lakh(m.Project)), h('b', { class: 'num' }, Kit.lakh(m.Retail + m.Project)));
        }) : h('div', { class: 'empty' }, 'Nothing dispatched yet.')));
    return h('div', { class: 'page', style: 'flex: 1; min-height: 0; overflow-y: auto', 'data-keep': 'asummary' },
      h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr)' }, h('div', { class: 'col' }, book, disp), h('div', { class: 'col' }, money)));
  };
})();
