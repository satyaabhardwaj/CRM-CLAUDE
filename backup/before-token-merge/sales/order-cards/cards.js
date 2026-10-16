// The six cards shown when a Token due or Booked client is opened, and the OCF strip at the end.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const P = SalesPieces;
  const drafts = {};

  const PRODUCTS = ['Kitchen', 'Wardrobe', 'Backsplash', 'Countertop', 'Sunroof'];
  const MODES = ['Bank transfer', 'UPI', 'Cheque', 'Pickup needed'];
  const TIMELINES = ['Standard', 'Express', 'Custom'];
  const PRODUCTION_DAYS = ['30', '35', '40', '45', '50', '55', '60'];
  const APPROVAL = ['Not sent', 'Pending', 'Approved', 'Rejected'];
  const TONE = { 'Not sent': 'grey', Pending: 'blue', Approved: 'green', Overwritten: 'yellow', Rejected: 'red', Requested: 'blue', Confirmed: 'green' };

  function line(label, control) { return h('div', { class: 'line' }, h('span', { style: 'color: var(--ink2)' }, label), control); }
  function narrow(control) { return h('span', { style: 'width: 130px; flex: none' }, control); }

  // 1 · Order. Only what the sales person types, and one total. The working is behind one small button.
  // The money maths lives in shared/rules.js; this card only shows it.
  const workOpen = {};
  function orderCard(c, ctx) {
    const o = c.order;
    const t = L.totals(c);
    const open = workOpen[c.id];
    const set = function (key) { return function (v) { ctx.update(function () { o[key] = v; }); }; };
    const show = function (label, amount) { return h('div', { class: 'line' }, h('span', { style: 'color: var(--ink2)' }, label), h('span', { class: 'num' }, Kit.money(amount))); };
    return Kit.card('1 · Order', '', 'blue',
      // The order is the kitchen. Its value is the only thing typed here; products and installation are not broken out.
      (o.products.length ? o.products : [null]).map(function (p) {
        return line(p && p.product ? p.product : 'Kitchen', narrow(Kit.input(p ? p.value : 0, function (v) {
          ctx.update(function () { if (p) { p.value = v; if (!p.product) p.product = 'Kitchen'; } else o.products.push({ product: 'Kitchen', value: v }); });
        }, { money: true, label: 'Kitchen value', placeholder: 'Value' })));
      }),
      line('Freight, loading and unloading', narrow(Kit.input(o.freight, set('freight'), { money: true, label: 'Freight', placeholder: '0' }))),
      line('Management discount', narrow(Kit.input(o.md, set('md'), { money: true, label: 'Management discount', placeholder: '0' }))),
      h('div', { class: 'line' }, h('span', { style: 'color: var(--ink2)' }, 'In bank, with GST'), h('span', { class: 'num' }, Kit.money(t.bank))),
      h('div', { class: 'line', style: 'border-top: 1px solid var(--line); padding-top: 12px' },
        h('b', null, 'Total payable by client'), h('span', { class: 'num', style: 'font-size: 22px; font-weight: 600' }, Kit.money(t.total))),
      h('div', null, Kit.btn(open ? 'Hide the working' : 'See how this is worked out', function () { workOpen[c.id] = !open; ctx.update(); }, 'small')),
      open ? h('div', { class: 'soft' },
        show('Offer basic value', t.base),
        show('Less management discount, no GST', t.md),
        show('Bank amount before GST', t.bankBase),
        show('GST 18% on the bank amount', t.tax),
        show('In bank, with GST', t.bank),
        show('Freight', t.freight),
        c.source === 'Architect reference' ? line('Architect code', narrow(Kit.input(o.architectCode, set('architectCode'), { label: 'Architect code' }))) : null,
        c.source === 'Architect reference' ? line('Architect fees (%)', narrow(Kit.input(o.archPct, function (v) { ctx.update(function () { o.archPct = Kit.num(v); }); }, { label: 'Architect fees percent', placeholder: '0' }))) : null,
        c.source === 'Architect reference' ? show('Success fees', t.success) : null,
        show('Net inflow to the company', t.net)) : null);
  }

  // 2 · Timeline
  function timelineCard(c, ctx) {
    const t = c.timeline;
    const d = L.dates(c);
    const was = (c.timelineChanges || [])[(c.timelineChanges || []).length - 1];
    const shares = L.shares(c);
    const due = function (name) { const s = shares.find(function (x) { return x.name === name; }); return s ? s.percent + '% due' : null; };
    const set = function (key) { return function (v) { ctx.update(function () { t[key] = v; }); }; };
    const stop = function (label, key, tag) {
      return h('div', null, h('i'), h('span', { class: 'sub' }, label), h('b', null, Kit.day(d[key])), tag ? h('small', null, tag) : null);
    };
    return Kit.card('2 · Timeline', '', 'violet',
      h('div', { class: 'g3' },
        Kit.field('Timeline', Kit.select(TIMELINES, t.type, set('type'), { placeholder: false })),
        Kit.field('Pooja / handover', Kit.input(t.handover, set('handover'), { type: 'date' })),
        Kit.field('Production days', Kit.select(PRODUCTION_DAYS, t.productionDays, set('productionDays'), { placeholder: false }))),
      !d ? null : (t.type === 'Custom'
        ? h('div', { class: 'g3' },
            Kit.field('Drawing signoff' + (due('Production') ? ' · ' + due('Production') : ''), Kit.input(d.signoff, function (v) { ctx.update(function () { t.custom.signoff = v; }); }, { type: 'date' })),
            Kit.field('PDI' + (due('PDI') ? ' · ' + due('PDI') : ''), Kit.input(d.pdi, function (v) { ctx.update(function () { t.custom.pdi = v; }); }, { type: 'date' })),
            Kit.field('Dispatch', Kit.input(d.dispatch, function (v) { ctx.update(function () { t.custom.dispatch = v; }); }, { type: 'date' })))
        : h('div', { class: 'tl' },
            stop('Drawing signoff', 'signoff', due('Production')),
            stop('PDI', 'pdi', due('PDI')),
            stop('Dispatch', 'dispatch'),
            stop('Handover', 'handover', due('EHOD')))),
      // Always both, side by side: what Sales first asked for, and what Design wrote over it (if it did).
      !d ? null : (function () {
        const changes = c.timelineChanges || [];
        const KEYS = [['Drawing signoff', 'signoff'], ['PDI', 'pdi'], ['Dispatch', 'dispatch'], ['Handover', 'handover']];
        // Once the client is booked, the original timeline is counted forward from the date of booking,
        // with the same gaps as everywhere else: production days to PDI, 20 days to dispatch, 30 days to handover.
        const start = c.bookedAt ? Kit.ymd(new Date(c.bookedAt)) : '';
        const fromBooking = function () {
          const pdi = Kit.addDays(start, Number(c.timeline.productionDays) || 45), dispatch = Kit.addDays(pdi, 20);
          return { signoff: start, pdi: pdi, dispatch: dispatch, handover: Kit.addDays(dispatch, 30) };
        };
        const original = start ? fromBooking() : (changes.length ? changes[0].before : d);
        const differs = KEYS.some(function (k) { return original[k[1]] !== d[k[1]]; });
        const block = function (title, note, dates, against) {
          return h('div', { class: 'soft' },
            h('b', { style: 'font-size: 12px; color: var(--ink2)' }, title), note ? h('span', { class: 'sub' }, note) : null,
            dates ? KEYS.map(function (k) {
              const moved = against && against[k[1]] !== dates[k[1]];
              return h('div', { class: 'line' }, h('span', { style: 'color: var(--ink2)' }, k[0]), moved ? h('b', null, Kit.day(dates[k[1]])) : h('span', null, Kit.day(dates[k[1]])));
            }) : h('div', { class: 'sub' }, 'Not overwritten. The original timeline stands.'));
        };
        return h('div', { class: 'g2' },
          block('Original timeline', start ? ' · from booking on ' + Kit.day(start) : ' · asked by Sales', original, null),
          block('Overwritten timeline', was ? ' · by Design on ' + Kit.day(was.at) : (differs ? ' · the dates in force now' : ''), was ? was.after : (differs ? d : null), original));
      })());
  }

  // 3 · Payment. Sales records what the client promised. Accounts records the money when it arrives.
  // Sales can still tell Accounts "the client says they have paid", with proof, so Accounts knows to look.
  const pingOpen = {};
  function paymentCard(c, ctx) {
    const pay = c.payment;
    const d = drafts[c.id] = drafts[c.id] || { amount: 0, date: Kit.today(), mode: '', ref: '', proof: '', kind: 'bank' };
    const shares = L.shares(c);
    const due = L.bookingDue(c), got = L.collected(c), left = L.bookingLeft(c);
    const setPay = function (key) { return function (v) { ctx.update(function () { pay[key] = v; }); }; };
    const open = pingOpen[c.id];
    const body = [
      line('Payment plan', h('span', { style: 'width: 210px; flex: none' }, Kit.select(Object.keys(L.PLANS).map(function (k) { return [k, L.PLANS[k].label]; }), pay.plan, setPay('plan'), { placeholder: false, label: 'Payment plan' }))),
      h('div', { class: 'sub' }, shares.map(function (s) { return s.name + ' ' + s.percent + '% ' + Kit.money(s.amount); }).join(' · ')),
      h('div', { class: 'pay-sum' },
        h('div', null, h('span', null, 'Booking amount'), h('b', { class: 'num' }, Kit.money(due))),
        h('div', null, h('span', null, 'Received · by Accounts'), h('b', { class: 'num' }, Kit.money(got))),
        h('div', null, h('span', null, 'Left'), h('b', { class: 'num ' + (left ? 'bad' : '') }, Kit.money(left)))),
      h('b', { style: 'font-size: 13px' }, 'What the client has promised'),
      h('div', { class: 'g3' },
        Kit.field('Token amount (₹)', Kit.input(pay.tokenPlan, setPay('tokenPlan'), { money: true, placeholder: 'Amount' })),
        Kit.field('Token date', Kit.input(pay.tokenBy, setPay('tokenBy'), { type: 'date' })),
        Kit.field('Rest of booking amount by', Kit.input(pay.expectedBy, setPay('expectedBy'), { type: 'date' }))),
      Kit.field('Billing name', P.billing(c, ctx)),
      pay.receipts.length ? h('b', { style: 'font-size: 13px' }, 'Money so far') : null,
      pay.receipts.map(function (r) {
        return h('div', { class: 'line rule' },
          h('span', null, h('b', { class: 'num' }, Kit.money(r.amount)), h('span', { class: 'sub' }, ' · ' + Kit.day(r.date) + (r.mode ? ' · ' + r.mode : '') + (r.kind === 'md' ? ' · management discount' : ''))),
          h('span', { class: 'flexrow' }, Kit.pill(r.status === 'Requested' ? 'With Accounts' : r.status, TONE[r.status]),
            r.status === 'Rejected' ? h('span', { class: 'msg' }, (r.reason || 'Rejected') + (r.notes ? ' · ' + r.notes : '')) : null,
            r.status !== 'Confirmed' ? Kit.btn('Remove', function () { ctx.update(function () { pay.receipts.splice(pay.receipts.indexOf(r), 1); }); }, 'small') : null));
      }),
      h('div', null, Kit.btn(open ? 'Cancel' : 'Tell Accounts the client has paid', function () { pingOpen[c.id] = !open; ctx.update(); }, 'small')),
      open ? h('div', { class: 'soft' },
        h('div', { class: 'g3' },
          Kit.field('Amount the client says (₹)', Kit.input(d.amount, function (v) { d.amount = v; }, { money: true, placeholder: 'Amount' })),
          Kit.field('Date', Kit.input(d.date, function (v) { d.date = v; }, { type: 'date' })),
          Kit.field('How it was paid', Kit.select(MODES, d.mode, function (v) { d.mode = v; }))),
        h('div', { class: 'line' }, h('span', null, 'Proof from the client', d.proof ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, d.proof)) : null), Kit.upload('Upload', d.proof, function (file) { Kit.store.sendFile(c.id, file).then(function (name) { d.proof = name; ctx.update(); }); })),
        Kit.warn(d),
        h('div', null, Kit.btn('Send to Accounts', function () {
          if (!d.amount) { d.msg = 'Enter the amount first.'; return ctx.update(); }
          ctx.update(function () {
            pay.receipts.push({ amount: d.amount, date: d.date, mode: d.mode, ref: d.ref, proof: d.proof, kind: d.kind, billing: c.billingPick, status: 'Requested', requestedAt: Kit.now() });
            delete drafts[c.id]; pingOpen[c.id] = false;
          });
        }, 'dark'))) : null
    ];
    return Kit.card('3 · Payment', '', 'green', body);
  }

  // 4 · Proof and documents
  function proofCard(c, ctx) {
    const rows = [['Signed quotation', 'quotation'], ['Signed drawing', 'drawing'], ['Screenshot', 'screenshot'], ['Recorded message', 'recording'], ['DRF and layout', 'drf']];
    return Kit.card('4 · Proof and documents', '', 'amber', rows.map(function (r) {
      return h('div', { class: 'line rule' }, h('span', null, r[0], c.docs[r[1]] ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, c.docs[r[1]])) : null), P.attach(c, r[1], ctx));
    }));
  }

  // 5 · Approvals. Design and Accounts decide on their own screens; the SM sees the result here.
  function approvalsCard(c, ctx) {
    const a = c.approvals;
    const why = c.approvalNotes || {};
    const tokenIn = L.tokenIn(c);
    const asked = c.payment.receipts.some(function (r) { return r.status === 'Requested'; });
    const refused = !tokenIn && !asked && c.payment.receipts.some(function (r) { return r.status === 'Rejected'; });
    const shown = function (label, who, key) {
      const note = a[key] === 'Rejected' && why[key] ? why[key].reason + (why[key].notes ? ' · ' + why[key].notes : '') : '';
      return h('div', { class: 'line rule' }, h('span', null, label, h('span', { class: 'sub' }, ' · ' + who), note ? h('div', { class: 'msg' }, note) : null),
        Kit.pill(a[key], TONE[a[key]]));
    };
    const rejected = a.booking === 'Rejected' || a.timeline === 'Rejected';
    // A booking cannot go for approval with no order value or no handover date: there would be nothing to approve.
    const ready = L.totals(c).total > 0 && !!c.timeline.handover;
    return Kit.card('5 · Approvals', '', 'teal',
      h('div', { class: 'line rule' }, h('span', null, 'Payment plan', h('span', { class: 'sub' }, ' · ' + L.PLANS[c.payment.plan].approver)),
        h('span', { style: 'width: 130px; flex: none' }, Kit.select(APPROVAL, a.plan, function (v) { ctx.update(function () { a.plan = v; }); }, { placeholder: false, label: 'Payment plan approval' }))),
      shown('Timeline', 'Design', 'timeline'),
      h('div', { class: 'line rule' }, h('span', null, 'Token', h('span', { class: 'sub' }, ' · Accounts')),
        Kit.pill(tokenIn ? 'Approved' : (asked ? 'Pending' : (refused ? 'Rejected' : 'Not requested')), tokenIn ? 'green' : (asked ? 'blue' : (refused ? 'red' : 'grey')))),
      shown('Booking', 'Accounts', 'booking'),
      h('div', { class: 'flexrow' },
        Kit.btn(c.measurement ? 'Measurement requested' : 'Request site measurement', function () { ctx.update(function () { c.measurement = { requestedAt: Kit.now(), date: '' }; }); }, '', { disabled: !tokenIn || !!c.measurement }),
        Kit.btn(rejected ? 'Send again' : (c.submittedAt ? 'Booking submitted' : 'Submit booking'), function () {
          ctx.update(function () {
            c.submittedAt = Kit.now();
            ['plan', 'timeline', 'booking'].forEach(function (k) { if (a[k] === 'Not sent' || (k !== 'plan' && a[k] === 'Rejected')) a[k] = 'Pending'; });
          });
        }, 'dark', { disabled: (!!c.submittedAt && !rejected) || !ready })),
      ready ? null : h('div', { class: 'msg' }, 'Before you submit: ' + [L.totals(c).total ? '' : 'fill the order value', c.timeline.handover ? '' : 'set the handover date in Timeline'].filter(Boolean).join(', ') + '.'),
      c.measurement ? Kit.field('Site measurement date', Kit.input(c.measurement.date, function (v) { ctx.update(function () { c.measurement.date = v; }); }, { type: 'date' })) : null);
  }

  // 6 · OCF, always last.
  function ocfCard(c, ctx) {
    return Kit.card('6 · OCF', '', 'grey',
      c.ocfAsked ? h('div', null, 'The OCF generator is not connected yet.') : null,
      h('div', null, Kit.btn('Generate OCF', function () { ctx.update(function () { c.ocfAsked = true; }); }, 'line')));
  }

  // One short form open at a time. The list on the left shows where each one stands.
  const open = {};
  function sections(c) {
    const a = c.approvals;
    const approved = ['plan', 'timeline', 'booking'].filter(function (k) { return a[k] === 'Approved' || a[k] === 'Overwritten'; }).length + (L.tokenIn(c) ? 1 : 0);
    const signed = (c.docs.quotation ? 1 : 0) + (c.docs.drawing ? 1 : 0);
    const last = L.lastSpoke(c);
    return [
      ['order', 'Order', Kit.money(L.totals(c).total), orderCard],
      ['timeline', 'Timeline', c.timeline.handover ? 'Handover ' + Kit.day(c.timeline.handover) : 'Not set', timelineCard],
      ['payment', 'Payment', Kit.money(L.collected(c)) + ' of ' + Kit.money(L.bookingDue(c)), paymentCard],
      ['proof', 'Proof and documents', signed + ' of 2 signed forms', proofCard],
      ['approvals', 'Approvals', approved + ' of 4 settled', approvalsCard],
      ['ocf', 'OCF', c.ocfAsked ? 'Asked' : 'Last step', ocfCard],
      ['contact', 'Log a contact', last ? 'Last spoke ' + Kit.day(last) : 'Not spoken yet', P.contactCard]
    ];
  }

  window.SalesCards = {
    render: function (c, ctx) {
      const list = sections(c);
      const now = list.find(function (s) { return s[0] === open[c.id]; }) || list[0];
      return [h('div', { class: 'cols2' },
        h('div', { class: 'steplist' }, list.map(function (s, i) {
          return h('button', { type: 'button', class: 'step' + (s === now ? ' on' : ''), onclick: function () { open[c.id] = s[0]; ctx.update(); } },
            h('span', { class: 'n' }, s[0] === 'contact' ? '+' : i + 1),
            h('span', { class: 'grow' }, h('b', null, s[1]), h('small', null, s[2])));
        })),
        now[3](c, ctx))];
    }
  };
})();
