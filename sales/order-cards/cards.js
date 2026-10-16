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
      Kit.bankOnly() ? null : line('Freight, loading and unloading', narrow(Kit.input(o.freight, set('freight'), { money: true, label: 'Freight', placeholder: '0' }))),
      Kit.bankOnly() ? null : line('Management discount', narrow(Kit.input(o.md, set('md'), { money: true, label: 'Management discount', placeholder: '0' }))),
      h('div', { class: 'line' }, h('span', { style: 'color: var(--ink2)' }, 'In bank, with GST'), h('span', { class: 'num' }, Kit.money(t.bank))),
      h('div', { class: 'line', style: 'border-top: 1px solid var(--line); padding-top: 12px' },
        h('b', null, 'Total payable by client'), h('span', { class: 'num', style: 'font-size: 22px; font-weight: 600' }, Kit.money(t.total))),
      Kit.bankOnly() ? null : h('div', null, Kit.btn(open ? 'Hide the working' : 'See how this is worked out', function () { workOpen[c.id] = !open; ctx.update(); }, 'small')),
      open && !Kit.bankOnly() ? h('div', { class: 'soft' },
        show('Offer basic value', t.base),
        show('Less management discount, no GST', t.md),
        show('Bank amount before GST', t.bankBase),
        show('GST 18% on the bank amount', t.tax),
        show('In bank, with GST', t.bank),
        show('Freight', t.freight),
        c.architectInvolved ? show('Less architect success fees · ' + (Number(o.archPct) || 0) + '% of offer basic value', t.success) : null,
        c.architectInvolved ? show('Offer basic value after success fees', t.afterSuccess) : null,
        show('Net inflow to the company', t.net)) : null,
      // The architect on this order. The fee is Magppie's cost; it is inside the offer basic value and the client is not shown it.
      Kit.bankOnly() ? null : Architects.forClient(c, ctx),
      Kit.bankOnly() || !c.architectInvolved || !t.success ? null : h('div', { class: 'line' }, h('span', { style: 'color: var(--ink2)' }, 'Architect success fees · ' + (Number(o.archPct) || 0) + '% · not shown to the client'), h('span', { class: 'num' }, Kit.money(t.success))));
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
        // The drawing is signed off when the OCF is made. Until there is an OCF date, the booking date stands in for it.
        const ocf = c.ocfAt ? Kit.ymd(new Date(c.ocfAt)) : '';
        const fromBooking = function () {
          const signoff = ocf || start;
          const pdi = Kit.addDays(signoff, Number(c.timeline.productionDays) || 45), dispatch = Kit.addDays(pdi, 20);
          return { signoff: signoff, pdi: pdi, dispatch: dispatch, handover: Kit.addDays(dispatch, 30) };
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
          block('Original timeline', start ? ' · booked ' + Kit.day(start) + (ocf ? ' · drawing signoff on the OCF date' : ' · drawing signoff moves to the OCF date once the OCF is made') : ' · asked by Sales', original, null),
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
      Kit.bankOnly() ? Kit.field('Booking amount by', Kit.input(pay.expectedBy, setPay('expectedBy'), { type: 'date' })) : h('div', { class: 'g3' },
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
            Kit.news(c, 'Sales says the client paid ' + Kit.money(d.amount) + ' · to confirm', 'blue', 'Sales');
            delete drafts[c.id]; pingOpen[c.id] = false;
          });
        }, 'dark'))) : null
    ];
    return Kit.card('3 · Payment', '', 'green', body);
  }

  // 4 · Proof and documents
  function proofCard(c, ctx) {
    const rows = [['Signed quotation', 'quotation'], ['Signed drawing', 'drawing'], ['Screenshot', 'screenshot'], ['Recorded message', 'recording']];
    // The recorded message can also be spoken here. The browser writes down what is said, free, and the words are kept with the client.
    const said = Kit.input(c.recordingText, function (v) { ctx.update(function () { c.recordingText = v; }); }, { placeholder: 'What the client said, typed or spoken', label: 'Recorded message, written down' });
    return Kit.card('4 · Proof and documents', '', 'amber', rows.map(function (r) {
      return h('div', { class: 'line rule' }, h('span', null, r[0], c.docs[r[1]] ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, c.docs[r[1]])) : null), P.attach(c, r[1], ctx));
    }),
      h('div', { class: 'flexrow' }, h('div', { class: 'grow' }, said),
        P.voice(function (text) { ctx.update(function () { c.recordingText = ((c.recordingText ? c.recordingText + ' ' : '') + text).trim(); }); })),
      h('div', { class: 'sub' }, 'Press the microphone and speak. The words are written down by the browser (Chrome or Safari).'));
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
    const rejected = a.booking === 'Rejected';
    // A booking cannot go for approval with no order value or no handover date: there would be nothing to approve.
    const ready = L.totals(c).total > 0 && !!c.timeline.handover;
    return Kit.card('5 · Approvals', '', 'teal',
      h('div', { class: 'line rule' }, h('span', null, Kit.bankOnly() ? 'First payment' : 'Token', h('span', { class: 'sub' }, ' · Accounts')),
        Kit.pill(tokenIn ? 'Approved' : (asked ? 'Pending' : (refused ? 'Rejected' : 'Not requested')), tokenIn ? 'green' : (asked ? 'blue' : (refused ? 'red' : 'grey')))),
      shown('Booking', 'Accounts', 'booking'),
      h('div', { class: 'flexrow' },
        Kit.btn(c.measurement ? 'Measurement requested' : 'Request site measurement', function () { ctx.update(function () { c.measurement = { requestedAt: Kit.now(), date: '' }; Kit.news(c, 'Site measurement requested', 'blue', 'Sales'); }); }, '', { disabled: !tokenIn || !!c.measurement }),
        Kit.btn(rejected ? 'Send again' : (c.submittedAt ? 'Booking submitted' : 'Submit booking'), function () {
          ctx.update(function () {
            c.submittedAt = Kit.now();
            if (a.booking === 'Not sent' || a.booking === 'Rejected') a.booking = 'Pending';
            Kit.news(c, 'Booking sent for approval · ' + Kit.money(L.totals(c).total), 'blue', 'Sales');
          });
        }, 'dark', { disabled: (!!c.submittedAt && !rejected) || !ready })),
      ready ? null : h('div', { class: 'msg' }, 'Before you submit: ' + [L.totals(c).total ? '' : 'fill the order value', c.timeline.handover ? '' : 'set the handover date in Timeline'].filter(Boolean).join(', ') + '.'),
      c.measurement ? Kit.field('Site measurement date', Kit.input(c.measurement.date, function (v) { ctx.update(function () { c.measurement.date = v; }); }, { type: 'date' })) : null);
  }

  // Signature by Zoho Sign. The engine does the talking to Zoho; this only shows where things stand.
  const signing = {};
  const SIGN_WORD = { inprogress: 'Waiting for signature', completed: 'Signed', declined: 'Declined', recalled: 'Recalled', expired: 'Expired' };
  function signBox(c, ctx) {
    const st = signing[c.id] = signing[c.id] || { busy: false, msg: '' };
    const s = c.ocfSign;
    const post = function (url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }); }, function () { return { error: 'offline' }; }); };
    const why = function (out) { return out.error === 'no key' ? 'Zoho Sign is not switched on yet. It needs its keys in the sign folder.' : (out.error === 'offline' ? 'Signatures work on the laptop copy only.' : (out.error || 'It did not go through. Try again.')); };
    const send = function () {
      if (!c.email) { st.msg = 'Add the client\'s email first (Names and phones, Email).'; return ctx.update(); }
      const form = window.OCF.forSigning(c);
      st.busy = true; st.msg = 'Sending to Zoho Sign…'; ctx.update();
      post('/api/sign/send', { pdf: form.pdf, filename: form.filename, marks: form.marks, title: 'Order Closure Form · ' + c.name + ' · ' + c.pid, name: c.person || c.name, email: c.email }).then(function (out) {
        st.busy = false;
        if (!out.id) { st.msg = why(out); return ctx.update(); }
        st.msg = out.test ? 'Test mode: sent to the test address, not to the client.' : '';
        ctx.update(function () {
          c.ocfSign = { id: out.id, status: 'inprogress', sentAt: Kit.now(), to: out.sent_to, test: !!out.test, filename: form.filename };
          c.ocfAsked = true; c.ocfAt = c.ocfAt || Kit.now();
          Kit.news(c, 'OCF sent for signature', 'blue', 'Sales');
        });
      });
    };
    const check = function () {
      st.busy = true; st.msg = 'Asking Zoho Sign…'; ctx.update();
      fetch('/api/sign/status?id=' + encodeURIComponent(s.id)).then(function (r) { return r.json(); }, function () { return { error: 'offline' }; }).then(function (out) {
        if (!out.status) { st.busy = false; st.msg = why(out); return ctx.update(); }
        if (out.status !== 'completed' || s.file) { st.busy = false; st.msg = ''; return ctx.update(function () { s.status = out.status; s.people = out.people; s.checkedAt = Kit.now(); }); }
        // Signed by everyone: bring the signed copy home and keep it with the client.
        post('/api/sign/fetch', { id: s.id, owner: c.id, filename: s.filename }).then(function (got) {
          st.busy = false; st.msg = got.name ? '' : why(got);
          ctx.update(function () { s.status = 'completed'; s.people = out.people; s.checkedAt = Kit.now(); if (got.name) { s.file = got.name; s.signedAt = Kit.now(); Kit.news(c, 'OCF signed by the client', 'green', 'Sales'); } });
        });
      });
    };
    return h('div', { class: 'soft' },
      h('div', { class: 'line' }, h('b', null, 'Signature · Zoho Sign'), s ? Kit.pill(SIGN_WORD[s.status] || s.status, s.status === 'completed' ? 'green' : (s.status === 'inprogress' ? 'blue' : 'red')) : Kit.pill('Not sent', 'grey')),
      s ? h('div', { class: 'sub' }, 'Sent ' + Kit.dayTime(s.sentAt) + ' to ' + (s.to || []).join(', ') + (s.test ? ' · test mode' : '') + (s.checkedAt ? ' · last checked ' + Kit.dayTime(s.checkedAt) : '')) : h('div', { class: 'sub' }, 'The client gets an email and signs on their phone or laptop.'),
      s && s.people ? h('div', { class: 'sub' }, s.people.map(function (p) { return p.name + ': ' + String(p.status || '').toLowerCase(); }).join(' · ')) : null,
      s && s.file ? h('div', null, 'Signed copy: ', Kit.fileLink(c.id, s.file)) : null,
      st.msg ? h('div', { class: 'msg' }, st.msg) : (!s && c.ocfSignProblem ? h('div', { class: 'msg' }, 'The automatic send did not go through: ' + c.ocfSignProblem) : null),
      !s ? h('div', { class: 'sub' }, 'Once Zoho Sign is switched on, this is sent by itself as soon as the token is in.') : (s.auto ? h('div', { class: 'sub' }, 'Sent by itself when the token came in.') : null),
      h('div', { class: 'flexrow' },
        Kit.btn(s ? 'Send again' : 'Send for signature', send, s ? 'small' : 'dark', { disabled: st.busy || !L.totals(c).total || !window.OCF }),
        s && s.status !== 'completed' ? Kit.btn('Check status', check, 'small dark', { disabled: st.busy }) : null));
  }

  // 6 · OCF, always last.
  function ocfCard(c, ctx) {
    return Kit.card('6 · OCF', '', 'grey',
      h('div', null, 'The Order Closure Form is made as a PDF in the company format: client and billing details, the dates, the product table, payment stages, terms and signature lines.'),
      c.ocfAt ? h('div', { class: 'hint' }, 'OCF made on ' + Kit.day(c.ocfAt) + '. The drawing signoff counts from this date.') : null,
      L.totals(c).total ? null : h('div', { class: 'msg' }, 'Fill the order value first.'),
      signBox(c, ctx),
      h('div', null, Kit.btn(c.ocfAt ? 'Download OCF again' : 'Generate OCF', function () { ctx.update(function () { if (!c.ocfAt) Kit.news(c, 'OCF made · drawing signoff counts from today', 'green', 'Sales'); c.ocfAsked = true; c.ocfAt = c.ocfAt || Kit.now(); }); window.OCF.make(c); }, 'dark', { disabled: !L.totals(c).total || !window.OCF })));
  }

  // One short form open at a time. The list on the left shows where each one stands.
  const open = {};
  function sections(c) {
    const a = c.approvals;
    const approved = (a.booking === 'Approved' ? 1 : 0) + (L.tokenIn(c) ? 1 : 0);
    const signed = (c.docs.quotation ? 1 : 0) + (c.docs.drawing ? 1 : 0);
    const last = L.lastSpoke(c);
    return [
      ['order', 'Order', Kit.money(L.totals(c).total), orderCard],
      ['timeline', 'Timeline', c.timeline.handover ? 'Handover ' + Kit.day(c.timeline.handover) : 'Not set', timelineCard],
      ['payment', 'Payment', Kit.money(L.collected(c)) + ' of ' + Kit.money(L.bookingDue(c)), paymentCard],
      ['proof', 'Proof and documents', signed + ' of 2 signed forms', proofCard],
      ['approvals', 'Approvals', approved + ' of 2 settled', approvalsCard],
      ['ocf', 'OCF', c.ocfAt ? 'Made ' + Kit.day(c.ocfAt) : 'Last step', ocfCard],
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
