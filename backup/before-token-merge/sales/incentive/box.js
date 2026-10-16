// Dashboard · Incentive. The rule is the one Manish wrote down. What the 70% is measured on is still
// to be confirmed, so no percentage is claimed here. The numbers shown are facts from the data, not the measure.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const RULE = { bar: 70, amount: 50000, release: 'quarterly' };
  function mine(all) { return all.filter(function (c) { return ['token', 'booked', 'post'].indexOf(c.stage) >= 0; }); }
  function fact(label, value) { return h('div', null, h('span', null, label), h('b', null, value)); }

  function table(ctx) {
    const rows = mine(ctx.all);
    const due = rows.reduce(function (t, c) { return t + L.bookingDue(c); }, 0);
    const got = rows.reduce(function (t, c) { return t + L.collected(c); }, 0);
    const booked = rows.filter(function (c) { return c.stage !== 'token'; });
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' }, h('div', null, h('h1', null, 'Incentive'), h('p', null, 'For the person chosen in "Viewing" at the top'))),
      h('div', { class: 'inc-grid' },
        Kit.card('The rule', '', 'violet',
          h('div', { class: 'line rule' }, h('span', { style: 'color: #14602F; font-weight: 600' }, RULE.bar + '% and above'), h('b', { class: 'inc-big' }, Kit.money(RULE.amount))),
          h('div', { class: 'sub' }, 'Released ' + RULE.release + '.'),
          h('div', { class: 'line rule' }, h('span', { style: 'color: #A1160A; font-weight: 600' }, 'Below ' + RULE.bar + '%'), h('b', { class: 'inc-big' }, 'Nil')),
          h('div', { class: 'msg' }, 'Still to be set: what the ' + RULE.bar + '% is measured on. Until then no percentage is shown.')),
        Kit.card('Your numbers so far', '', 'grey', h('div', { class: 'facts' },
          fact('Orders approved by clients', String(rows.length)),
          fact('Order value', Kit.short(rows.reduce(function (t, c) { return t + L.totals(c).total; }, 0))),
          fact('Booked (token confirmed)', Kit.short(booked.reduce(function (t, c) { return t + L.totals(c).total; }, 0)) + ' (' + booked.length + ')'),
          fact('Booking share due', Kit.short(due)),
          fact('Collected', Kit.short(got)),
          fact('Collected against booking share', due ? Math.round(got / due * 100) + '%' : 'Nothing due yet')),
          h('div', { class: 'sub' }, 'These are counted from your clients. They are shown for reference and are not yet the incentive measure.'))));
  }

  Sales.register({ id: 'incentive', title: 'Incentive', short: 'Incentive', page: true, table: table,
    summary: function () { return RULE.bar + '% and above: ' + Kit.money(RULE.amount) + ' · below: nil'; } });
})();
