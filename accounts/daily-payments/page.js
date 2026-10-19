// Accounts · Daily payments: the one place the day's money is entered. One line per payment: client, date, amount,
// bank or management, mode, reference. Every balance, %, approval and PI updates from it at once.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  const S = { day: '' };
  const blank = function () { return { client: '', amount: 0, date: Kit.today(), mode: '', ref: '', kind: 'bank' }; };
  let d = blank();
  A.dailyMain = function (ctx) {
    const day = S.day || Kit.today();
    const clients = ctx.all.filter(A.inPlay).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    const picked = clients.find(function (c) { return c.id === d.client; });
    const came = [];
    ctx.all.forEach(function (c) { c.payment.receipts.forEach(function (r) { if (r.status === 'Confirmed' && r.date === day) came.push({ c: c, r: r }); }); });
    const sum = function (kind) { return came.reduce(function (n, x) { return n + ((x.r.kind === 'md') === (kind === 'md') ? Number(x.r.amount) || 0 : 0); }, 0); };
    const form = Kit.card('Enter a payment', picked ? A.nextLine(picked) : '', 'teal',
      h('div', { class: 'g3' },
        Kit.field('Client', Kit.select(clients.map(function (c) { return [c.id, c.name + ' · ' + c.pid]; }), d.client, function (v) { d.client = v; ctx.update(); }, { label: 'Client' })),
        Kit.field('Amount (₹)', Kit.input(d.amount, function (v) { d.amount = v; }, { money: true })),
        Kit.field('Date received', Kit.input(d.date, function (v) { d.date = v; }, { type: 'date' })),
        Kit.bankOnly() ? null : Kit.field('Goes to', Kit.select([['bank', 'In bank'], ['md', 'Management']], d.kind, function (v) { d.kind = v; }, { placeholder: false })),
        Kit.field('How it was paid', Kit.select(A.MODES, d.mode, function (v) { d.mode = v; })),
        Kit.field('Reference number', Kit.input(d.ref, function (v) { d.ref = v; }))),
      picked ? (function () { const m = A.money(picked); return h('div', { class: 'sub' }, 'Received so far ' + Kit.money(m.paid) + ' of ' + Kit.money(m.t.total) + ' · ' + A.pctText(m.pct) + ' · balance ' + Kit.money(m.balance)); })() : null,
      Kit.warn(d),
      Kit.btn('Save payment', function () {
        if (!picked) { d.msg = 'Choose the client.'; return ctx.update(); }
        const why = A.checkPayment(d);
        if (why) { d.msg = why; return ctx.update(); }
        ctx.update(function () { A.record(picked, d); S.day = d.date; d = blank(); });
      }, 'dark'));
    const list = Kit.list('Payments on ' + Kit.day(day),
      h('div', { class: 'flexrow' }, h('span', { class: 'sub' }, 'Bank ' + Kit.short(sum('bank')) + (Kit.bankOnly() ? '' : ' · management ' + Kit.short(sum('md')))),
        h('span', { style: 'width: 150px' }, Kit.input(day, function (v) { S.day = v; ctx.update(); }, { type: 'date', label: 'Day' }))),
      came.map(function (x) {
        return { name: x.c.name + ' · ' + Kit.money(x.r.amount), sub: (x.r.kind === 'md' ? 'Management' : 'In bank') + ' · ' + (x.r.mode || '') + (x.r.ref ? ' · ' + x.r.ref : '') + ' · by ' + (x.r.by || 'Accounts'),
          pill: Kit.pill(A.pctText(A.money(x.c).pct), 'green'), pick: function () { ctx.show({ kind: 'expected', id: x.c.id }); } };
      }), 'No payments entered for this day.');
    return h('div', { class: 'page', style: 'flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px' }, form, h('div', { class: 'onelist', style: 'flex: 1; min-height: 0' }, list));
  };
})();
