// Accounts · the two payment windows: a payment Sales says has come (confirm or reject it),
// and a client's money window (what is expected, what came, the approvals, the PIs, and a payment to record).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  const fact = A.fact;

  A.paymentWindow = function (c, r, ctx) {
    const first = !L.tokenIn(c);
    return {
      title: c.name,
      tag: Kit.pill((first && !Kit.bankOnly() ? 'Token' : 'Payment') + ' · ' + Kit.money(r.amount), 'blue'),
      sub: c.pid + ' · ' + c.cid + ' · sent by ' + People.owner(c) + ' · ' + Kit.dayTime(r.requestedAt),
      body: [h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        Kit.card('Payment sent by Sales', '', 'green',
          h('div', { class: 'facts' },
            fact('Amount', Kit.money(r.amount)), fact('Goes to', r.kind === 'md' ? 'Management discount' : 'In bank'),
            fact('Date', Kit.day(r.date)), fact('Billing for this payment', (c.billing.find(function (b) { return b.id === r.billing; }) || {}).name || A.billing(c)),
            fact('How it was paid', r.mode), fact('Reference number', r.ref),
            fact('Billing name', A.billing(c)), fact('Payment plan', L.PLANS[c.payment.plan].label),
            fact('Total order value', Kit.money(L.totals(c).total)), fact('Booking share', Kit.money(L.bookingDue(c))),
            fact('Confirmed so far', Kit.money(L.collected(c))), fact('Booking amount left', Kit.money(L.bookingLeft(c)))),
          h('div', { class: 'line rule' }, h('span', null, 'Payment proof'), Kit.fileLink(c.id, r.proof) || h('span', { class: 'sub' }, 'Not uploaded'))),
        A.decision('p' + c.id + r.requestedAt, ctx,
          function () {
            ctx.update(function () {
              r.status = 'Confirmed'; r.decidedAt = Kit.now();
              if (c.stage === 'token') { c.stage = 'booked'; c.bookedAt = Kit.now(); }
              Kit.news(c, 'Accounts confirmed ' + Kit.money(r.amount), 'green', 'Accounts');
            });
            ctx.close();
          },
          function (why) {
            ctx.update(function () {
              r.status = 'Rejected'; r.decidedAt = Kit.now(); r.reason = why.reason; r.notes = why.notes;
              Kit.news(c, 'Accounts rejected ' + Kit.money(r.amount) + ': ' + why.reason, 'red', 'Accounts');
            });
            ctx.close();
          }, 'Confirm receipt'))]
    };
  };

  // One payment, recorded by Accounts when it actually arrives. Used here and on the Daily payments page.
  A.record = function (c, d) {
    c.payment.receipts.push({ amount: d.amount, date: d.date, mode: d.mode, ref: d.ref, kind: d.kind, billing: d.billing || c.billingPick, status: 'Confirmed', decidedAt: Kit.now(), by: 'Accounts' });
    if (c.stage === 'token') { c.stage = 'booked'; c.bookedAt = Kit.now(); }
    Kit.news(c, 'Accounts received ' + Kit.money(d.amount) + (d.kind === 'md' ? ' (management)' : ' (bank)'), 'green', 'Accounts');
  };
  A.checkPayment = function (d) {
    if (!d.amount) return 'Enter the amount.';
    if (!d.date) return 'Enter the date it came.';
    if (!d.mode) return 'Choose how it was paid.';
    return '';
  };

  // A client's money: what is expected, what came, the approvals and PIs, and a payment to record.
  A.expectedWindow = function (c, ctx) {
    const pay = c.payment;
    const d = A.drafts['e' + c.id] = A.drafts['e' + c.id] || { amount: 0, date: Kit.today(), mode: '', ref: '', kind: 'bank', billing: c.billingPick };
    const m = A.money(c), t = m.t;
    return {
      title: c.name,
      tag: Kit.pill(A.pctText(m.pct) + ' received · ' + Kit.short(m.balance) + ' balance', m.balance ? 'red' : 'green'),
      sub: c.pid + ' · ' + c.cid + ' · ' + People.owner(c) + ' · ' + c.payment.plan + ' plan · with ' + A.team(c) + ' · ' + A.nextLine(c),
      body: [h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        h('div', { class: 'col' },
          Kit.card('Money', '', 'green',
            h('div', { class: 'facts' },
              fact('Offer basic value', Kit.money(t.base)), fact('Total payable by client', Kit.money(t.total)),
              fact('Bank · received of due', Kit.money(m.bankGot) + ' of ' + Kit.money(t.bank)),
              Kit.bankOnly() ? null : fact('Management · received of due', Kit.money(m.mgmtGot) + ' of ' + Kit.money(t.mgmt)),
              fact('Received', Kit.money(m.paid) + ' · ' + A.pctText(m.pct)), fact('Balance', Kit.money(m.balance)),
              Kit.bankOnly() ? null : fact('Bank % · free accessories %', (t.bankPct == null ? 'not set' : t.bankPct + '%') + ' · ' + (t.faPct == null ? (t.freight ? 'amount typed before 19 Oct' : 'not set') : t.faPct + '%')),
              fact('Token promised', pay.tokenPlan ? Kit.money(pay.tokenPlan) + (pay.tokenBy ? ' by ' + Kit.day(pay.tokenBy) : '') : ''),
              fact('Rest of booking amount by', pay.expectedBy ? Kit.day(pay.expectedBy) : '')),
            L.ledger(c).map(function (s) {
              return h('div', { class: 'line rule' }, h('span', null, h('b', null, s.name), h('span', { class: 'sub' }, ' · ' + s.percent + '% · ' + Kit.money(s.amount))),
                Kit.pill(s.due === 0 && s.amount ? 'Paid' : (s.paid ? Kit.money(s.due) + ' left' : 'Not paid'), s.due === 0 && s.amount ? 'green' : 'grey'));
            }),
            pay.receipts.map(function (r) {
              return h('div', { class: 'line rule' }, h('span', null, h('b', { class: 'num' }, Kit.money(r.amount)), h('span', { class: 'sub' }, ' · ' + Kit.day(r.date) + (r.mode ? ' · ' + r.mode : '') + (r.ref ? ' · ' + r.ref : '') + (r.kind === 'md' ? ' · management' : ' · in bank'))),
                Kit.pill(r.status === 'Requested' ? 'To confirm' : r.status, { Confirmed: 'green', Requested: 'yellow', Rejected: 'red' }[r.status]));
            })),
          A.piCard(c)),
        h('div', { class: 'col' },
          A.gatesCard(c, ctx),
          Kit.card('Record a payment', '', 'teal',
            h('div', { class: 'g2' },
              Kit.field('Amount (₹)', Kit.input(d.amount, function (v) { d.amount = v; }, { money: true })),
              Kit.field('Date received', Kit.input(d.date, function (v) { d.date = v; }, { type: 'date' })),
              Kit.field('How it was paid', Kit.select(A.MODES, d.mode, function (v) { d.mode = v; })),
              Kit.field('Reference number', Kit.input(d.ref, function (v) { d.ref = v; })),
              Kit.bankOnly() ? null : Kit.field('Goes to', Kit.select([['bank', 'In bank'], ['md', 'Management']], d.kind, function (v) { d.kind = v; }, { placeholder: false })),
              Kit.field('Billing name', Kit.select(c.billing.map(function (b) { return [b.id, b.name + ' · ' + b.id]; }), d.billing, function (v) { d.billing = v; }, { placeholder: false }))),
            Kit.warn(d),
            Kit.btn('Record payment', function () {
              const why = A.checkPayment(d);
              if (why) { d.msg = why; return ctx.update(); }
              ctx.update(function () { A.record(c, d); delete A.drafts['e' + c.id]; });
            }, 'dark'))))]
    };
  };
})();
