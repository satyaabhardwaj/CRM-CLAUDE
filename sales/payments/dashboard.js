// Dashboard · Payments. Everything the sales person still has to collect, by due date.
// Left: principally closed clients (the token, then the booking amount).
// Right: booked clients (the rest of the booking amount, up to the booking share).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const WHEN = [['overdue', 'Overdue'], ['today', 'Due today'], ['later', 'Coming up'], ['none', 'No date set'], ['pick', 'Pick a date']];
  const view = { when: '', date: '' };

  function info(c) {
    const date = L.payDue(c);
    const amount = L.atStake(c);
    if (!date) return { date: '', amount: amount, when: 'none', text: 'No date set', tone: 'grey' };
    const late = Math.round((new Date(Kit.today()) - new Date(date)) / 86400000);
    return { date: date, amount: amount, when: late > 0 ? 'overdue' : (late === 0 ? 'today' : 'later'),
      text: late > 0 ? 'Overdue · ' + late + ' day(s)' : (late === 0 ? 'Due today' : 'Due ' + Kit.day(date).replace(/ \d{4}$/, '')), tone: late > 0 ? 'red' : (late === 0 ? 'yellow' : 'grey') };
  }
  function shows(x) {
    if (view.when === 'pick') return !view.date || x.date === view.date;
    return !view.when || x.when === view.when;
  }
  function owing(c) { return (c.stage === 'token' || c.stage === 'booked') && L.atStake(c) > 0; }
  function sum(rows) { return rows.reduce(function (t, r) { return t + r.x.amount; }, 0); }

  function table(ctx) {
    const all = ctx.all.filter(owing).filter(ctx.match).map(function (c) { return { c: c, x: info(c) }; });
    const rows = all.filter(function (r) { return shows(r.x); }).sort(function (a, b) { return (a.x.date || '9999') < (b.x.date || '9999') ? -1 : 1; });
    const tile = function (label, key, tone) {
      const list = all.filter(function (r) { return r.x.when === key; });
      return h('button', { type: 'button', class: 'pay-tile' + (view.when === key ? ' on' : ''), onclick: function () { view.when = view.when === key ? '' : key; ctx.update(); } },
        h('span', null, label), h('b', { class: 'num ' + (tone && list.length ? 'bad' : '') }, Kit.short(sum(list)) + ' (' + list.length + ')'));
    };
    const list = function (title, stage, empty) {
      const mine = rows.filter(function (r) { return (stage === 'token') === !L.tokenIn(r.c); });
      return Kit.list(title + ' · ' + Kit.short(sum(mine)), null, mine.map(function (r) {
        const c = r.c;
        const what = stage === 'token'
          ? (c.payment.receipts.some(function (x) { return x.status === 'Requested'; }) ? (Kit.bankOnly() ? 'Payment with Accounts' : 'Token with Accounts') : (Kit.bankOnly() ? 'Booking amount' : (Number(c.payment.tokenPlan) ? 'Token' : 'Token or booking amount')))
          : 'Rest of booking amount · collected ' + Kit.money(L.collected(c)) + ' of ' + Kit.money(L.bookingDue(c));
        return { id: c.id, name: c.name + ' · ' + Kit.short(r.x.amount), sub: what + ' · order ' + Kit.short(L.totals(c).total) + ' · ' + c.payment.plan + ' plan',
          pill: Kit.pill(r.x.text, r.x.tone), mark: r.x.when === 'overdue' ? 'bad' : '', pick: function () { ctx.open(c); } };
      }), empty);
    };
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' },
        h('div', null, h('h1', null, 'Payments'), h('p', null, 'What you still have to collect, by due date · ' + Kit.short(sum(all)) + ' from ' + all.length + ' clients')),
        h('div', { class: 'flexrow' },
          h('div', { style: 'width: 170px' }, Kit.select(WHEN, view.when, function (v) { view.when = v; ctx.update(); }, { placeholder: 'Every due date', label: 'Due date' })),
          view.when === 'pick' ? h('div', { style: 'width: 160px' }, Kit.input(view.date, function (v) { view.date = v; ctx.update(); }, { type: 'date', label: 'Date' })) : null)),
      h('div', { class: 'pay-tiles' }, tile('Overdue', 'overdue', true), tile('Due today', 'today'), tile('Coming up', 'later'), tile('No date set', 'none')),
      h('div', { class: 'twolists' },
        list(Kit.bankOnly() ? 'No payment yet' : 'Token not in', 'token', Kit.bankOnly() ? 'Every booked client has paid something.' : 'Every booked client has paid a token.'),
        list('Booked', 'booked', 'Nothing to collect here.')));
  }

  Sales.register({ id: 'payments', title: 'Payments', short: 'Pay', page: true, table: table,
    summary: function (all) {
      const rows = all.filter(owing).map(info);
      const late = rows.filter(function (x) { return x.when === 'overdue'; });
      return Kit.short(rows.reduce(function (t, x) { return t + x.amount; }, 0)) + ' to collect · ' + late.length + ' overdue';
    } });
})();
