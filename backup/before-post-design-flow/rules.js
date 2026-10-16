// Order rules every department reads the same way: clocks, retry timer, money maths, payment plans, timeline dates.
(function () {
  const L = {};

  // Payment plans. The first share is always the booking share.
  L.PLANS = {
    SM: { label: 'SM · 50 / 30 / 20', approver: 'SM', shares: [['Booking', 50], ['Production', 30], ['PDI', 20]] },
    AVP: { label: 'AVP · 25 / 25 / 30 / 20', approver: 'AVP', shares: [['Booking', 25], ['EPT', 25], ['Production', 30], ['PDI', 20]] },
    Founder: { label: 'Founder · 25 / 25 / 30 / 15 / 5', approver: 'Founder', shares: [['Booking', 25], ['EPT', 25], ['Production', 30], ['PDI', 15], ['EHOD', 5]] }
  };
  L.STAGES = [['qualified', 'Qualified'], ['design', 'In design'], ['booked', 'Booked · collecting']];

  // Fill in anything a client record is missing, so screens never trip on an empty spot.
  L.ensure = function (c) {
    if (c.hoursAgo != null) { c.receivedAt = new Date(Date.now() - c.hoursAgo * 3600000).toISOString(); delete c.hoursAgo; }
    if (c.retryInHours != null) { c.retry = { tries: 1, dueAt: new Date(Date.now() + c.retryInHours * 3600000).toISOString() }; delete c.retryInHours; }
    c.contacts = c.contacts || [];
    c.validation = c.validation || {};
    c.docs = c.docs || {};
    c.billing = c.billing || [{ id: 'B-' + c.cid.replace('C-', '') + '-1', name: c.name }];
    c.billingPick = c.billingPick || c.billing[0].id;
    c.design = c.design || {};
    c.design.brief = c.design.brief || {};
    c.design.brief.kitchenType = c.design.brief.kitchenType || [];
    c.design.proposals = c.design.proposals || [];
    c.design.revisions = c.design.revisions || [];
    c.order = c.order || {};
    c.order.products = c.order.products || [];
    c.timeline = c.timeline || { type: 'Standard', productionDays: 45 };
    c.timeline.custom = c.timeline.custom || {};
    c.payment = c.payment || {};
    c.payment.plan = c.payment.plan || 'SM';
    c.payment.receipts = c.payment.receipts || [];
    c.approvals = c.approvals || { plan: 'Not sent', timeline: 'Not sent', booking: 'Not sent' };
    // There is no separate token stage any more: a client who has approved and signed is booked, and the token is simply the first payment.
    if (c.stage === 'token') { c.stage = 'booked'; c.bookedAt = c.bookedAt || c.approvedAt || Kit.now(); }
    // Once the token has come in, the token boxes show what actually came and when, instead of staying empty.
    const first = c.payment.receipts.filter(function (r) { return r.status === 'Confirmed'; })[0];
    if (first && !c.payment.tokenPlan) c.payment.tokenPlan = Number(first.amount) || 0;
    if (first && !c.payment.tokenBy) c.payment.tokenBy = first.date || '';
    return c;
  };

  // Project and customer numbers. The next one is always one more than the highest in use.
  L.nextId = function (all, key, prefix, start) {
    const top = all.reduce(function (max, c) { return Math.max(max, Number(String(c[key] || '').replace(prefix, '')) || 0); }, start);
    return prefix + (top + 1);
  };
  // Two screens can each add a client at the same moment and hand out the same numbers.
  // When their saves meet, the one that arrives second gets fresh numbers, and its billing names follow.
  Kit.store.onAdd = function (c, others) {
    const taken = function (key) { return others.some(function (o) { return o.id !== c.id && o[key] === c[key] && !(c.groupId && o.groupId === c.groupId); }); };
    if (taken('pid')) c.pid = L.nextId(others, 'pid', 'P-', 1000);
    if (!taken('cid')) return;
    const was = c.cid.replace('C-', '');
    c.cid = L.nextId(others, 'cid', 'C-', 2200);
    const swap = function (id) { return id ? String(id).replace('B-' + was + '-', 'B-' + c.cid.replace('C-', '') + '-') : id; };
    (c.billing || []).forEach(function (b) { b.id = swap(b.id); });
    c.billingPick = swap(c.billingPick);
    ((c.payment || {}).receipts || []).forEach(function (r) { r.billing = swap(r.billing); });
  };

  // The 24-hour rule: only a real conversation counts.
  L.firstCall = function (c) {
    const left = 24 - Kit.hoursSince(c.receivedAt);
    return { done: !!c.spokeAt, hoursLeft: left, late: !c.spokeAt && left < 0 };
  };
  L.clock = function (c) {
    const fc = L.firstCall(c);
    if (fc.done) return c.missed24 ? ['Spoke · after 24h', 'red'] : ['Spoke', 'green'];
    if (c.retry) {
      const due = (new Date(c.retry.dueAt).getTime() - Date.now()) / 3600000;
      const text = 'Try ' + (c.retry.tries + 1) + (due >= 0 ? ' · ' + Kit.span(due) + ' left' : ' · ' + Kit.span(due) + ' late');
      return [text, fc.late || due < 0 ? 'red' : 'yellow'];
    }
    return fc.late ? ['Missed · ' + Kit.span(fc.hoursLeft) + ' late', 'red'] : [Kit.span(fc.hoursLeft) + ' left', 'grey'];
  };

  // No answer: call again in 12 hours, then 6, then half again, never under 1 hour.
  function noAnswer(c) {
    const tries = (c.retry ? c.retry.tries : 0) + 1;
    const hours = Math.max(1, 12 / Math.pow(2, tries - 1));
    c.retry = { tries: tries, dueAt: new Date(Date.now() + hours * 3600000).toISOString() };
  }
  function spoke(c) {
    if (!c.spokeAt) {
      c.spokeAt = Kit.now();
      if (Kit.hoursSince(c.receivedAt) > 24) c.missed24 = true;
    }
    c.retry = null;
  }
  L.logContact = function (c, entry) {
    c.contacts.unshift(Object.assign({ at: Kit.now() }, entry));
    if (entry.outcome === 'No answer') noAnswer(c);
    if (entry.outcome === 'Spoke to client') spoke(c);
    if (entry.next || entry.outcome === 'Spoke to client') c.nextFollowUp = entry.next || '';
  };
  L.lastSpoke = function (c) {
    const hit = c.contacts.find(function (e) { return e.outcome === 'Spoke to client'; });
    return hit ? hit.at : (c.spokeAt || null);
  };

  // Money. The maths Manish set out:
  //   Offer basic value (shown to the client, success fees included) = products + installation
  //   The management discount is decided on the spot and typed in. No GST on it.
  //   The bank amount is the offer basic value minus the management discount. GST is 18% on that bank part only.
  //   Freight is typed by hand and added as it is.
  //   Total payable by client = management discount + received in bank (with GST) + freight
  //   Gross inflow = received in bank + management discount + freight
  //   Net inflow = gross inflow - GST - success fees
  L.totals = function (c) {
    const o = c.order;
    const products = o.products.reduce(function (sum, p) { return sum + (Number(p.value) || 0); }, 0);
    const obv = products + (Number(o.installation) || 0);
    const md = Math.min(obv, Math.max(0, Number(o.md) || 0));
    const bankBase = obv - md;
    const gst = Math.round(bankBase * 0.18);
    const bank = bankBase + gst;
    const freight = Number(o.freight) || 0;
    const success = Math.round(obv * (Number(o.archPct) || 0) / 100);
    const total = md + bank + freight;
    return { products: products, base: obv, bankBase: bankBase, tax: gst, bank: bank, md: md, freight: freight,
      success: success, afterSuccess: obv - success, total: total, gross: bank + md + freight, net: bank + md + freight - gst - success };
  };
  // How much of what came in went through the bank, and how much was management discount.
  L.received = function (c) {
    const out = { bank: 0, md: 0 };
    c.payment.receipts.forEach(function (r) { if (r.status === 'Confirmed') out[r.kind === 'md' ? 'md' : 'bank'] += Number(r.amount) || 0; });
    return out;
  };
  // What is at stake on a client right now, for lists that show one amount per row.
  L.atStake = function (c) {
    if (c.stage === 'design') { const p = c.design.proposals[c.design.proposals.length - 1]; return p ? Number(p.amount) || 0 : 0; }
    if (c.stage === 'booked') return L.tokenIn(c) ? L.bookingLeft(c) : (Number(c.payment.tokenPlan) || L.bookingDue(c));
    return 0;
  };
  // When the next payment is due: the token date first, then the date for the rest of the booking amount.
  L.payDue = function (c) { return L.tokenIn(c) ? (c.payment.expectedBy || '') : (c.payment.tokenBy || c.payment.expectedBy || ''); };
  L.shares = function (c) {
    const total = L.totals(c).total;
    return L.PLANS[c.payment.plan].shares.map(function (s) {
      return { name: s[0], percent: s[1], amount: Math.round(total * s[1] / 100) };
    });
  };
  L.bookingDue = function (c) { return L.shares(c)[0].amount; };
  L.collected = function (c) {
    return c.payment.receipts.reduce(function (sum, r) { return sum + (r.status === 'Confirmed' ? Number(r.amount) || 0 : 0); }, 0);
  };
  L.bookingLeft = function (c) { return Math.max(0, L.bookingDue(c) - L.collected(c)); };
  L.tokenIn = function (c) { return c.payment.receipts.some(function (r) { return r.status === 'Confirmed'; }); };

  // Money stage by stage. What has come in is counted against the plan's shares in order:
  // the booking share first, then the next, and so on. Each line says how much of that share is paid.
  L.ledger = function (c) {
    let left = L.collected(c);
    return L.shares(c).map(function (s) {
      const paid = Math.min(left, s.amount);
      left -= paid;
      return { name: s.name, percent: s.percent, amount: s.amount, paid: paid, due: s.amount - paid };
    });
  };
  // Pre-design ends when the booking share is in. From then on Design is the point of contact, not the sales person.
  L.handed = function (c) { return c.stage === 'post' || (c.stage === 'booked' && L.bookingLeft(c) === 0); };
  // Post-design, in order. Design is the point of contact all the way.
  //   Production drawing: the final drawing is not signed off yet.
  //   Collect 30%:        the drawing is signed off; the 30% production payment is still to come.
  //   Factory:            the 30% is in after the signoff. The order is now in the factory's bucket.
  //   Dispatch, Handed over: read from the planned dates once it is in the factory.
  L.POST = ['Production drawing', 'Collect 30%', 'Factory', 'Dispatch', 'Handed over'];
  L.productionRow = function (c) { return L.ledger(c).filter(function (r) { return r.name === 'Production'; })[0] || null; };
  L.postStage = function (c) {
    if (!c.drawingSignedAt) return 'Production drawing';
    if (!c.factoryAt) return 'Collect 30%';
    const d = L.dates(c), today = Kit.today();
    if (!d || today < d.dispatch) return 'Factory';
    return today < d.handover ? 'Dispatch' : 'Handed over';
  };
  // Called whenever the drawing is signed off or money comes in. If both conditions are now true, the order moves
  // to the Factory once, a notice is written, and the factory is emailed (through mail/, if that is switched on).
  L.toFactory = function (c) {
    if (c.factoryAt || !c.drawingSignedAt || !L.handed(c)) return false;
    const row = L.productionRow(c);
    if (row && row.due > 0) return false;
    c.factoryAt = Kit.now();
    Kit.news(c, 'The 30% is in after the final drawing signoff · order moved to Factory', 'green', 'Design');
    const d = L.dates(c), t = L.totals(c);
    const body = ['An order has moved to the Factory.', '', 'Client: ' + c.name, 'Project: ' + c.pid + '   Customer: ' + c.cid, 'Designer: ' + (c.design.designer || 'not allotted'),
      'Final drawing signed off: ' + Kit.day(c.drawingSignedAt), 'Order value: Rs ' + Kit.commas(t.total), 'Received so far: Rs ' + Kit.commas(L.collected(c)),
      d ? 'PDI: ' + Kit.day(d.pdi) + '   Dispatch: ' + Kit.day(d.dispatch) + '   Handover: ' + Kit.day(d.handover) : 'Dates: not set', '', 'Sent by the Magppie CRM.'].join('\n');
    c.factoryMail = { state: 'sending' };
    fetch('/api/mail/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'factory', subject: 'Order to Factory: ' + c.name + ' (' + c.pid + ')', body: body }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); }, function () { return { error: 'offline' }; })
      .then(function (out) {
        c.factoryMail = out.sent ? { state: 'sent', to: out.to, at: Kit.now(), test: !!out.test }
          : { state: 'not sent', why: out.error === 'no key' ? 'Email is not switched on yet (mail folder).' : (out.error === 'offline' ? 'Emails are sent from the laptop copy only.' : (out.error || 'It did not go through.')) };
        Kit.store.save();
      });
    return true;
  };

  // Timeline, counted back from the handover date.
  L.dates = function (c) {
    const t = c.timeline;
    if (!t.handover) return null;
    const dispatch = Kit.addDays(t.handover, -30);
    const pdi = Kit.addDays(dispatch, -20);
    const signoff = Kit.addDays(pdi, -(Number(t.productionDays) || 45));
    const out = { signoff: signoff, pdi: pdi, dispatch: dispatch, handover: t.handover };
    if (t.type === 'Custom') ['signoff', 'pdi', 'dispatch'].forEach(function (k) { if (t.custom[k]) out[k] = t.custom[k]; });
    return out;
  };

  window.SalesLogic = L;
})();
