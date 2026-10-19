// Accounts · pieces more than one Accounts page needs: the stage list, a client's line for one stage,
// the approve / reject card, the money a client still owes, and the Accounts approvals (gates) card.
// Every page puts its own part on window.AccountsParts (A).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts = {};
  A.drafts = {};
  A.REASONS = ['Not Received', 'Information Incomplete'];
  A.MODES = ['Bank transfer', 'UPI', 'Cheque', 'Cash', 'Pickup needed'];

  // The stage tabs, and the name each one has in the payment plans.
  A.STAGES = [['booking', 'Booking', 'Booking'], ['ept', 'EPT', 'EPT'], ['drawing', 'Production drawing', 'Production'], ['pdi', 'PDI', 'PDI'], ['handover', 'Handover', 'EHOD']];
  A.inPlay = function (c) { return c.stage === 'token' || c.stage === 'booked' || c.stage === 'post'; };
  A.hasOrder = function (c) { return A.inPlay(c) && c.order.products.length && L.totals(c).total > 0; };

  // This client's line for one stage: what is due there, what is paid, and whether it is their turn to pay it.
  A.line = function (c, share) {
    const rows = L.ledger(c);
    const i = rows.findIndex(function (r) { return r.name === share; });
    if (i < 0) return null;
    const earlier = rows.slice(0, i).every(function (r) { return r.due === 0; });
    const d = L.dates(c);
    const by = share === 'Booking' ? L.payDue(c) : (d ? { Production: d.signoff, PDI: d.pdi, EHOD: d.handover }[share] || '' : '');
    return Object.assign({ now: earlier && rows[i].due > 0, done: rows[i].due === 0 && rows[i].amount > 0, by: by }, rows[i]);
  };

  A.fact = function (label, value) { return h('div', null, h('span', null, label), h('b', null, value || 'Not given')); };
  A.billing = function (c) {
    const b = c.billing.find(function (x) { return x.id === c.billingPick; }) || c.billing[0];
    return b.name + ' · ' + b.id + (b.gst ? ' · GST ' + b.gst : '') + (b.pan ? ' · PAN ' + b.pan : '') + (b.sameAsSite ? (c.siteAddress ? ' · ' + c.siteAddress : '') : (b.address ? ' · ' + b.address + (b.pin ? ' ' + b.pin : '') : ''));
  };

  // Approve, or reject with a reason and notes.
  A.decision = function (key, ctx, onApprove, onReject, approveLabel) {
    const d = A.drafts[key] = A.drafts[key] || { reason: '', notes: '' };
    return Kit.card('Your decision', '', 'teal',
      Kit.btn(approveLabel, function () { delete A.drafts[key]; onApprove(); }, 'dark'),
      Kit.field('Rejection reason', Kit.select(A.REASONS, d.reason, function (v) { d.reason = v; })),
      Kit.field('Accounts notes', Kit.input(d.notes, function (v) { d.notes = v; })),
      Kit.warn(d),
      Kit.btn('Reject', function () {
        if (!d.reason) { d.msg = 'Choose the rejection reason.'; return ctx.update(); }
        const copy = { reason: d.reason, notes: d.notes };
        delete A.drafts[key];
        onReject(copy);
      }, 'warn'));
  };

  // Where a client's money stands: total, bank and management (each received of due), %, balance.
  A.money = function (c) {
    const t = L.totals(c), got = L.received(c), paid = L.collected(c);
    return { t: t, bankGot: got.bank, bankDue: Math.max(0, t.bank - got.bank), mgmtGot: got.md, mgmtDue: Math.max(0, t.mgmt - got.md),
      paid: paid, balance: Math.max(0, t.total - paid), pct: t.total ? paid / t.total * 100 : 0 };
  };
  // Below 50% received the order is still with Sales; from 50% on it is with Design (as in the Accounts sheet).
  A.team = function (c) { return A.money(c).pct < 50 ? 'Sales' : 'Design'; };
  A.pctText = function (n) { return (Math.floor(n * 100) / 100).toFixed(2) + '%'; };

  // The next Accounts approval this client is heading for, and the money still short for it.
  A.nextGate = function (c) {
    for (let i = 0; i < L.GATES.length; i++) {
      const g = L.gate(c, L.GATES[i][0]);
      if (!g.approved) return Object.assign({ label: L.GATES[i][1] }, g);
    }
    return null;
  };
  A.nextLine = function (c) {
    const g = A.nextGate(c);
    if (!g) return 'All approvals done';
    if (g.ready) return g.label + ' · ' + g.pct + '% in · ready to approve';
    if (g.short) return g.label + ' · ' + Kit.short(g.short) + ' more for ' + g.pct + '%';
    return g.label + ' · ' + g.pct + '% in · ' + (g.key === 'factory' ? 'waiting for the PDI' : 'waiting for the earlier step');
  };

  // The four Accounts approvals on one client, each with its Approve button when the money is in.
  A.gatesCard = function (c, ctx) {
    return Kit.card('Accounts approvals', '% of the total payable ' + Kit.money(L.totals(c).total), 'violet',
      L.GATES.map(function (x) {
        const g = L.gate(c, x[0]);
        const state = g.approved ? Kit.pill('Approved ' + Kit.day(g.approved.at), 'green')
          : (g.ready ? Kit.btn('Approve', function () { ctx.update(function () { L.approveGate(c, x[0], 'Accounts'); }); }, 'small dark')
            : Kit.pill(g.short ? Kit.short(g.short) + ' short' : (x[0] === 'factory' ? 'PDI not approved yet' : 'Earlier step first'), g.short ? 'red' : 'grey'));
        return h('div', { class: 'line rule' }, h('span', null, h('b', null, x[1]), h('span', { class: 'sub' }, ' · ' + g.pct + '% · ' + Kit.money(g.need))), state);
      }),
      h('div', { class: 'hint' }, '50% sends the order to Design. 80% opens the production drawing, and with the PDI approved, the factory. 100% opens dispatch.'));
  };
})();
