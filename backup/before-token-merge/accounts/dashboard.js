// Accounts: takes and verifies the money at every stage of an order. The slim tabs on top are the stages:
// Booking, EPT, Production drawing, PDI and Handover. Which stages a client pays at comes from their payment plan.
// Payments sent by Sales are confirmed or rejected here, and completed bookings are approved.
// Every decision shows on the sales person's screen by itself.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const REASONS = ['Not Received', 'Information Incomplete'];
  const drafts = {};
  const MODES = ['Bank transfer', 'UPI', 'Cheque', 'Pickup needed'];

  // The stage tabs, and the name each one has in the payment plans.
  const STAGES = [['booking', 'Booking', 'Booking'], ['ept', 'EPT', 'EPT'], ['drawing', 'Production drawing', 'Production'], ['pdi', 'PDI', 'PDI'], ['handover', 'Handover', 'EHOD']];
  const inPlay = function (c) { return c.stage === 'token' || c.stage === 'booked' || c.stage === 'post'; };
  // This client's line for one stage: what is due there, what is paid, and whether it is their turn to pay it.
  function line(c, share) {
    const rows = L.ledger(c);
    const i = rows.findIndex(function (r) { return r.name === share; });
    if (i < 0) return null;
    const earlier = rows.slice(0, i).every(function (r) { return r.due === 0; });
    const d = L.dates(c);
    const by = share === 'Booking' ? L.payDue(c) : (d ? { Production: d.signoff, PDI: d.pdi, EHOD: d.handover }[share] || '' : '');
    return Object.assign({ now: earlier && rows[i].due > 0, done: rows[i].due === 0 && rows[i].amount > 0, by: by }, rows[i]);
  }

  function fact(label, value) { return h('div', null, h('span', null, label), h('b', null, value || 'Not given')); }
  function billing(c) {
    const b = c.billing.find(function (x) { return x.id === c.billingPick; }) || c.billing[0];
    return b.name + ' · ' + b.id + (b.gst ? ' · GST ' + b.gst : '') + (b.pan ? ' · PAN ' + b.pan : '') + (b.sameAsSite ? (c.siteAddress ? ' · ' + c.siteAddress : '') : (b.address ? ' · ' + b.address + (b.pin ? ' ' + b.pin : '') : ''));
  }

  // Approve, or reject with a reason and notes.
  function decision(key, ctx, onApprove, onReject, approveLabel) {
    const d = drafts[key] = drafts[key] || { reason: '', notes: '' };
    return Kit.card('Your decision', '', 'teal',
      Kit.btn(approveLabel, function () { delete drafts[key]; onApprove(); }, 'dark'),
      Kit.field('Rejection reason', Kit.select(REASONS, d.reason, function (v) { d.reason = v; })),
      Kit.field('Accounts notes', Kit.input(d.notes, function (v) { d.notes = v; })),
      Kit.warn(d),
      Kit.btn('Reject', function () {
        if (!d.reason) { d.msg = 'Choose the rejection reason.'; return ctx.update(); }
        const copy = { reason: d.reason, notes: d.notes };
        delete drafts[key];
        onReject(copy);
      }, 'warn'));
  }

  function paymentWindow(c, r, ctx) {
    const first = !L.tokenIn(c);
    return {
      title: c.name,
      tag: Kit.pill((first ? 'Token' : 'Payment') + ' · ' + Kit.money(r.amount), 'blue'),
      sub: c.pid + ' · ' + c.cid + ' · sent by ' + People.owner(c) + ' · ' + Kit.dayTime(r.requestedAt),
      body: [h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        Kit.card('Payment sent by Sales', '', 'green',
          h('div', { class: 'facts' },
            fact('Amount', Kit.money(r.amount)), fact('Goes to', r.kind === 'md' ? 'Management discount' : 'In bank'),
            fact('Date', Kit.day(r.date)), fact('Billing for this payment', (c.billing.find(function (b) { return b.id === r.billing; }) || {}).name || billing(c)),
            fact('How it was paid', r.mode), fact('Reference number', r.ref),
            fact('Billing name', billing(c)), fact('Payment plan', L.PLANS[c.payment.plan].label),
            fact('Total order value', Kit.money(L.totals(c).total)), fact('Booking share', Kit.money(L.bookingDue(c))),
            fact('Confirmed so far', Kit.money(L.collected(c))), fact('Booking amount left', Kit.money(L.bookingLeft(c)))),
          h('div', { class: 'line rule' }, h('span', null, 'Payment proof'), Kit.fileLink(c.id, r.proof) || h('span', { class: 'sub' }, 'Not uploaded'))),
        decision('p' + c.id + r.requestedAt, ctx,
          function () {
            ctx.update(function () {
              r.status = 'Confirmed'; r.decidedAt = Kit.now();
              if (c.stage === 'token') { c.stage = 'booked'; c.bookedAt = Kit.now(); }
              Kit.news(c, 'Accounts confirmed ' + Kit.money(r.amount), 'green');
            });
            ctx.close();
          },
          function (why) {
            ctx.update(function () {
              r.status = 'Rejected'; r.decidedAt = Kit.now(); r.reason = why.reason; r.notes = why.notes;
              Kit.news(c, 'Accounts rejected ' + Kit.money(r.amount) + ': ' + why.reason, 'red');
            });
            ctx.close();
          }, 'Confirm receipt'))]
    };
  }

  // Money that is expected. Accounts records it here when it actually arrives.
  function expectedWindow(c, ctx) {
    const pay = c.payment;
    const d = drafts['e' + c.id] = drafts['e' + c.id] || { amount: 0, date: Kit.today(), mode: '', ref: '', kind: 'bank', billing: c.billingPick };
    const t = L.totals(c);
    const got = L.received(c);
    return {
      title: c.name,
      tag: (function () {
        const st = STAGES.filter(function (x) { return x[0] === ctx.tab; })[0];
        const row = st && st[0] !== 'booking' ? line(c, st[2]) : null;
        return row ? Kit.pill(Kit.money(row.due) + ' left of ' + st[1] + ' amount', row.due ? 'red' : 'green') : Kit.pill(Kit.money(L.bookingLeft(c)) + ' left of booking amount', 'red');
      })(),
      sub: c.pid + ' · ' + c.cid + ' · ' + People.owner(c) + ' · ' + c.payment.plan + ' plan',
      body: [h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        Kit.card('What Sales expects', '', 'green',
          h('div', { class: 'facts' },
            fact('Token promised', pay.tokenPlan ? Kit.money(pay.tokenPlan) : ''), fact('Token date', pay.tokenBy ? Kit.day(pay.tokenBy) : ''),
            fact('Rest of booking amount by', pay.expectedBy ? Kit.day(pay.expectedBy) : ''), fact('Booking amount', Kit.money(L.bookingDue(c))),
            fact('Received so far', Kit.money(L.collected(c))), fact('Total payable by client', Kit.money(t.total)),
            fact('In bank · received of due', Kit.money(got.bank) + ' of ' + Kit.money(t.bank + t.freight)), fact('Management discount · received of due', Kit.money(got.md) + ' of ' + Kit.money(t.md))),
          L.ledger(c).map(function (s) {
            return h('div', { class: 'line rule' }, h('span', null, h('b', null, s.name), h('span', { class: 'sub' }, ' · ' + s.percent + '% · ' + Kit.money(s.amount))),
              Kit.pill(s.due === 0 && s.amount ? 'Paid' : (s.paid ? Kit.money(s.due) + ' left' : 'Not paid'), s.due === 0 && s.amount ? 'green' : 'grey'));
          }),
          pay.receipts.map(function (r) {
            return h('div', { class: 'line rule' }, h('span', null, h('b', { class: 'num' }, Kit.money(r.amount)), h('span', { class: 'sub' }, ' · ' + Kit.day(r.date) + (r.mode ? ' · ' + r.mode : '') + (r.kind === 'md' ? ' · management discount' : ' · in bank'))),
              Kit.pill(r.status === 'Requested' ? 'To confirm' : r.status, { Confirmed: 'green', Requested: 'yellow', Rejected: 'red' }[r.status]));
          })),
        Kit.card('Record a payment', '', 'teal',
          h('div', { class: 'g2' },
            Kit.field('Amount (₹)', Kit.input(d.amount, function (v) { d.amount = v; }, { money: true })),
            Kit.field('Date received', Kit.input(d.date, function (v) { d.date = v; }, { type: 'date' })),
            Kit.field('How it was paid', Kit.select(MODES, d.mode, function (v) { d.mode = v; })),
            Kit.field('Reference number', Kit.input(d.ref, function (v) { d.ref = v; })),
            Kit.field('Goes to', Kit.select([['bank', 'In bank'], ['md', 'Management discount']], d.kind, function (v) { d.kind = v; }, { placeholder: false })),
            Kit.field('Billing name', Kit.select(c.billing.map(function (b) { return [b.id, b.name + ' · ' + b.id]; }), d.billing, function (v) { d.billing = v; }, { placeholder: false }))),
          Kit.warn(d),
          Kit.btn('Record payment', function () {
            if (!d.amount) { d.msg = 'Enter the amount.'; return ctx.update(); }
            if (!d.mode) { d.msg = 'Choose how it was paid.'; return ctx.update(); }
            ctx.update(function () {
              pay.receipts.push({ amount: d.amount, date: d.date, mode: d.mode, ref: d.ref, kind: d.kind, billing: d.billing, status: 'Confirmed', decidedAt: Kit.now(), by: 'Accounts' });
              if (c.stage === 'token') { c.stage = 'booked'; c.bookedAt = Kit.now(); }
              Kit.news(c, 'Accounts received ' + Kit.money(d.amount), 'green');
              delete drafts['e' + c.id];
            });
            ctx.close();
          }, 'dark')))]
    };
  }

  function bookingWindow(c, ctx) {
    const t = L.totals(c);
    const dates = L.dates(c);
    const o = c.order;
    return {
      title: c.name,
      tag: Kit.pill('Booking to approve', 'blue'),
      sub: c.pid + ' · ' + c.cid + ' · sent by ' + People.owner(c) + ' · ' + Kit.dayTime(c.submittedAt),
      body: [h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        Kit.card('Booking sent by Sales', '', 'blue',
          h('div', { class: 'facts' },
            fact('Billing name', billing(c)), fact('Site', c.city + ' · ' + c.product),
            fact('Products', o.products.map(function (p) { return (p.product || 'Product') + ' ' + Kit.money(p.value); }).join(', ')), fact('Installation', Kit.money(o.installation)),
            fact('Offer basic value', Kit.money(t.base)), fact('GST on the bank part', Kit.money(t.tax)),
            fact('Received in bank (due)', Kit.money(t.bank)), fact('Management discount (due)', Kit.money(t.md)),
            fact('Freight', Kit.money(t.freight)), fact('Total payable by client', Kit.money(t.total)),
            fact('Payment plan', L.PLANS[c.payment.plan].label + ' · ' + c.approvals.plan), fact('Stage amounts', L.shares(c).map(function (s) { return s.name + ' ' + Kit.money(s.amount); }).join(', ')),
            fact('Confirmed so far', Kit.money(L.collected(c))), fact('Booking amount left', Kit.money(L.bookingLeft(c)) + (c.payment.expectedBy ? ' · by ' + Kit.day(c.payment.expectedBy) : '')),
            fact('Handover', dates ? Kit.day(dates.handover) : ''), fact('Timeline · Design', c.approvals.timeline)),
          h('div', { class: 'line rule' }, h('span', null, 'Signed quotation'), Kit.fileLink(c.id, c.docs.quotation) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'line rule' }, h('span', null, 'Signed drawing'), Kit.fileLink(c.id, c.docs.drawing) || h('span', { class: 'sub' }, 'Not uploaded'))),
        decision('b' + c.id, ctx,
          function () {
            ctx.update(function () {
              c.approvals.booking = 'Approved';
              c.approvalNotes = c.approvalNotes || {}; c.approvalNotes.booking = { reason: '', notes: '', at: Kit.now() };
              Kit.news(c, 'Accounts approved the booking', 'green');
            });
            ctx.close();
          },
          function (why) {
            ctx.update(function () {
              c.approvals.booking = 'Rejected';
              c.approvalNotes = c.approvalNotes || {}; c.approvalNotes.booking = { reason: why.reason, notes: why.notes, at: Kit.now() };
              Kit.news(c, 'Accounts rejected the booking: ' + why.reason, 'red');
            });
            ctx.close();
          }, 'Approve booking'))]
    };
  }

  Kit.app({
    id: 'accounts',
    title: 'Accounts',
    tabs: function (all) {
      return STAGES.map(function (st) {
        const n = st[0] === 'booking'
          ? all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && L.bookingLeft(c) > 0; }).length
          : all.filter(function (c) { if (!inPlay(c) || !c.order.products.length) return false; const row = line(c, st[2]); return row && row.now; }).length;
        return { id: st[0], label: st[1], count: n };
      });
    },
    build: function (ctx) {
      const stage = STAGES.filter(function (x) { return x[0] === ctx.tab; })[0] || STAGES[0];
      const opened = ctx.open ? ctx.all.find(function (x) { return x.id === ctx.open.id; }) : null;
      // Every stage after Booking: who has to pay it now, who will later, and who already has.
      if (stage[0] !== 'booking') {
        const rows = ctx.all.filter(function (c) { return inPlay(c) && c.order.products.length; })
          .map(function (c) { return { c: c, x: line(c, stage[2]) }; }).filter(function (r) { return r.x; });
        const when = function (r) { return r.x.by ? Kit.day(r.x.by).replace(/ \d{4}$/, '') : 'No date'; };
        const late = function (r) { return r.x.by && r.x.by < Kit.today(); };
        const item = function (r, pill) {
          return { name: r.c.name + ' · ' + Kit.money(r.x.due || r.x.amount), sub: People.owner(r.c) + ' · ' + r.c.payment.plan + ' plan · ' + r.x.percent + '% of ' + Kit.money(L.totals(r.c).total) + ' · paid ' + Kit.money(r.x.paid),
            pill: pill, pick: function () { ctx.show({ kind: 'expected', id: r.c.id }); } };
        };
        const now = rows.filter(function (r) { return r.x.now; }).sort(function (a, b) { return (a.x.by || '9999') < (b.x.by || '9999') ? -1 : 1; });
        const soon = rows.filter(function (r) { return !r.x.now && !r.x.done; });
        const done = rows.filter(function (r) { return r.x.done; });
        const stageMain = h('div', { class: 'twolists', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
          Kit.list(stage[1] + ' payment due now', null, now.map(function (r) { return item(r, Kit.pill(late(r) ? 'Overdue · ' + when(r) : 'Due ' + when(r), late(r) ? 'red' : 'grey')); }), 'Nobody has to pay at this stage right now.'),
          Kit.list('Coming up', null, soon.map(function (r) { return item(r, Kit.pill('An earlier stage is unpaid', 'grey')); }), 'Nothing coming up.'),
          Kit.list('Received', null, done.map(function (r) { return item(r, Kit.pill('Paid', 'green')); }), 'Nothing received at this stage yet.'));
        return { main: stageMain, window: opened && ctx.open.kind === 'expected' ? expectedWindow(opened, ctx) : null };
      }
      const pays = [];
      // Only clients still in play: one that Sales has deleted or lost must not ask Accounts for anything.
      ctx.all.filter(inPlay).forEach(function (c) { c.payment.receipts.forEach(function (r) { if (r.status === 'Requested') pays.push({ c: c, r: r }); }); });
      pays.sort(function (a, b) { return new Date(a.r.requestedAt || 0) - new Date(b.r.requestedAt || 0); });
      const books = ctx.all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && c.approvals.booking === 'Pending'; });

      const owing = ctx.all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && L.bookingLeft(c) > 0; })
        .map(function (c) { const by = L.payDue(c); return { c: c, by: by, late: by ? Math.round((new Date(Kit.today()) - new Date(by)) / 86400000) : 0 }; })
        .sort(function (a, b) { return (a.by || '9999') < (b.by || '9999') ? -1 : 1; });
      const main = h('div', { class: 'twolists', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
        Kit.list('Payments expected', null,
          owing.map(function (x) {
            const c = x.c;
            const amount = c.stage === 'token' ? (Number(c.payment.tokenPlan) || L.bookingLeft(c)) : L.bookingLeft(c);
            return { name: c.name + ' · ' + Kit.money(amount), sub: People.owner(c) + ' · ' + (c.stage === 'token' ? 'token' : 'rest of booking amount') + ' · received ' + Kit.money(L.collected(c)),
              pill: Kit.pill(!x.by ? 'No date' : (x.late > 0 ? x.late + ' day(s) overdue' : (x.late === 0 ? 'Due today' : 'Due ' + Kit.day(x.by).replace(/ \d{4}$/, ''))), x.late > 0 ? 'red' : 'grey'),
              pick: function () { ctx.show({ kind: 'expected', id: c.id }); } };
          }), 'No payments are expected.'),
        Kit.list('Sales says paid · to confirm', null,
          pays.map(function (x) {
            return { name: x.c.name, sub: People.owner(x.c) + ' · ' + (x.r.mode || 'Mode not given') + (x.r.ref ? ' · ' + x.r.ref : '') + ' · ' + Kit.day(x.r.date),
              pill: Kit.pill(Kit.money(x.r.amount), 'blue'), pick: function () { ctx.show({ kind: 'payment', id: x.c.id, at: x.r.requestedAt }); } };
          }), 'Nothing from Sales to confirm.'),
        Kit.list('Bookings to approve', null,
          books.map(function (c) {
            return { name: c.name, sub: People.owner(c) + ' · ' + Kit.money(L.totals(c).total) + ' · ' + c.payment.plan + ' plan · collected ' + Kit.money(L.collected(c)),
              pill: Kit.pill('Pending', 'blue'), pick: function () { ctx.show({ kind: 'booking', id: c.id }); } };
          }), 'No bookings are waiting.'));

      const c = ctx.open ? ctx.all.find(function (x) { return x.id === ctx.open.id; }) : null;
      let win = null;
      if (c && ctx.open.kind === 'booking') win = bookingWindow(c, ctx);
      if (c && ctx.open.kind === 'expected') win = expectedWindow(c, ctx);
      if (c && ctx.open.kind === 'payment') {
        const r = c.payment.receipts.find(function (x) { return x.requestedAt === ctx.open.at && x.status === 'Requested'; });
        if (r) win = paymentWindow(c, r, ctx);
      }
      return { main: main, window: win };
    }
  });
})();
