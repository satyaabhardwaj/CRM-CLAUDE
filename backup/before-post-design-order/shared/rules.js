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
    // Before 19 Oct the order went to Design by itself once the booking share was in. Those orders keep their place:
    // the first time a client is seen without gates, a fully paid booking is marked as already approved.
    if (!c.gates) {
      c.gates = {};
      if (c.stage === 'post' || (c.stage === 'booked' && c.order.products.length && L.bookingLeft(c) === 0)) c.gates.design = { at: c.movedAt || c.bookedAt || Kit.now(), by: 'Before the Accounts approval rule' };
      if (c.factoryAt) c.gates.factory = { at: c.factoryAt, by: 'Before the Accounts approval rule' };
    }
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

  // Money. The maths of the Accounts sheet ("Correct Data", Manish, 19 Oct 2026):
  //   Offer basic value (OBV, shown to the client, success fees included) = products + installation
  //   Bank %: typed per order. Bank part = OBV x bank %. GST is 18% on the bank part only.
  //   The rest of the OBV (100% - bank %) is the management discount. No GST on it.
  //   Free accessories %: typed per order, on the management part: OBV x (100% - bank %) x free accessories %.
  //   Total payable by client = OBV + GST + free accessories
  //   Management amount to collect = total - bank amount = management discount + free accessories
  //   Gross inflow = total. Net inflow = gross inflow - GST - success fees
  // Orders saved before 19 Oct carry a typed management discount (o.md) and freight (o.freight) instead of the two %;
  // they keep their amounts until someone types the %.
  L.pct = function (v) { return v === '' || v == null || isNaN(Number(v)) ? null : Math.min(100, Math.max(0, Number(v))); };
  L.totals = function (c) {
    const o = c.order;
    const products = o.products.reduce(function (sum, p) { return sum + (Number(p.value) || 0); }, 0);
    const obv = products + (Number(o.installation) || 0);
    const bankPct = L.pct(o.bankPct), faPct = L.pct(o.faPct);
    // As in the sheet, the parts are worked out exactly and each line is rounded to the rupee on its own,
    // so the bank amount and the management amount are each the rounded sum of their exact parts.
    const mdX = bankPct != null ? obv * (100 - bankPct) / 100 : Math.min(obv, Math.max(0, Number(o.md) || 0));
    const baseX = obv - mdX, gstX = baseX * 0.18;
    const faX = faPct != null ? mdX * faPct / 100 : (Number(o.freight) || 0);
    const md = Math.round(mdX), bankBase = Math.round(baseX), gst = Math.round(gstX), freight = Math.round(faX);
    const bank = Math.round(baseX + gstX), mgmt = Math.round(mdX + faX);
    const success = Math.round(obv * (Number(o.archPct) || 0) / 100);
    const total = bank + mgmt;
    return { products: products, base: obv, bankBase: bankBase, tax: gst, bank: bank, md: md, freight: freight, mgmt: mgmt,
      bankPct: obv ? (bankPct != null ? bankPct : Math.round(bankBase / obv * 10000) / 100) : bankPct, faPct: faPct,
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
    // Each share is rounded to the rupee; the last one takes what is left, so the shares always add up to the total.
    const list = L.PLANS[c.payment.plan].shares;
    let given = 0;
    return list.map(function (s, i) {
      const amount = i === list.length - 1 ? total - given : Math.round(total * s[1] / 100);
      given += amount;
      return { name: s[0], percent: s[1], amount: amount };
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
  // Accounts gates (Manish, 19 Oct 2026). Each one opens only when the money is in AND Accounts clicks Approve.
  // The % is counted on the total payable (OBV + GST + free accessories), as in the Accounts sheet, and is cumulative:
  //   design    booking share in (50% on the SM plan)              -> the order goes to Design (post-design)
  //   drawing   booking + production shares in (80%)                -> Design may do the production drawing
  //   factory   80% in and the PDI approved                         -> shot to the factory, factory emailed
  //   dispatch  100% in                                             -> may be dispatched
  L.GATES = [['design', 'Booking · to Design'], ['drawing', 'Production drawing'], ['factory', 'Factory go-ahead'], ['dispatch', 'Dispatch']];
  L.gatePct = function (c, key) {
    const shares = L.PLANS[c.payment.plan].shares;
    if (key === 'design') return shares[0][1];
    if (key === 'dispatch') return 100;
    let sum = 0, hit = false;
    shares.forEach(function (s) { if (!hit) sum += s[1]; if (s[0] === 'Production') hit = true; });
    return hit ? sum : 100;
  };
  // Where one gate stands: the % it needs, the money that must be in, how much is still short, and whether Accounts approved it.
  L.gate = function (c, key) {
    const total = L.totals(c).total, pct = L.gatePct(c, key), got = L.collected(c);
    const need = Math.round(total * pct / 100), short = Math.max(0, need - got);
    const g = (c.gates || {})[key] || null;
    const before = key === 'factory' ? !!L.flow(c).pdi.approvedAt : (key === 'drawing' || key === 'dispatch' ? !!(c.gates || {}).design || c.stage === 'post' : c.stage === 'booked');
    return { key: key, pct: pct, need: need, got: got, short: short, approved: g, ready: !g && total > 0 && short === 0 && before, before: before };
  };
  L.approveGate = function (c, key, by) {
    c.gates = c.gates || {};
    c.gates[key] = { at: Kit.now(), by: by || 'Accounts' };
    const name = L.GATES.filter(function (x) { return x[0] === key; })[0][1];
    Kit.news(c, 'Accounts approved: ' + name, 'green', 'Accounts');
    if (key === 'factory') L.toFactory(c);
  };
  L.gateOpen = function (c, key) { return !!(c.gates || {})[key]; };
  // Pre-design ends when Accounts approves the booking share. From then on Design is the point of contact, not the sales person.
  L.handed = function (c) { return c.stage === 'post' || (c.stage === 'booked' && L.gateOpen(c, 'design')); };
  // Post-design, in order (Manish, 15 Oct 2026; matches the Phase Wise Flow and the PRD):
  //   EPT:          after the first site measurement, the EPT (Electrical, Plumbing, Tiling, Ducting, Gas) drawings,
  //                 sent to the client, returned or signed. Done when the client signs the EPT.
  //   Appliances:   the appliance list is built and sent; the client may send it back; done when the client signs it.
  //   Design:       red until the first site measurement, then always in progress (it keeps being revised) until it
  //                 is finally approved. The client also signs the production drawing.
  //   PDI:          after the final design, the PDI team does the last PDI; Design approves it here.
  //   Accounts go-ahead: 80% in and Accounts approves the factory gate (19 Oct 2026; replaces "PDI + 30%").
  //   Factory:      the order is shot to the factory and the factory is emailed.
  //   Dispatch:     once 100% is in and Accounts approves dispatch. Handed over is read from the handover date.
  L.POST = ['EPT', 'Appliances', 'Design', 'PDI', 'Accounts go-ahead', 'Factory', 'Dispatch', 'Handed over'];
  L.EPT_STEPS = ['Site measurement done', 'EPT drawing being made', 'EPT drawing sent to client', 'Client asked for changes', 'Client signed the EPT'];
  // The post-design record on a client, created empty the first time it is needed.
  L.flow = function (c) {
    c.post = c.post || {};
    const f = c.post;
    f.ept = f.ept || { step: '', log: [], signedAt: '', file: '' };
    f.appliances = f.appliances || { items: [], log: [], signedAt: '', file: '' };
    f.design = f.design || { log: [], approvedAt: '' };
    f.pdi = f.pdi || { log: [], approvedAt: '' };
    return f;
  };
  // The first site measurement: done in Measurement, or recorded as the first EPT step.
  L.siteMeasured = function (c) { const f = L.flow(c); return !!((c.measurement && c.measurement.doneAt) || f.ept.log.length || f.ept.step); };
  // Red (todo), yellow (progress) or green (done) for each of the three, with how many rounds so far.
  L.flowState = function (c) {
    const f = L.flow(c);
    const count = function (log, what) { return log.filter(function (x) { return x.what === what; }).length; };
    return {
      ept: { state: f.ept.signedAt ? 'done' : (L.siteMeasured(c) ? 'progress' : 'todo'), step: f.ept.signedAt ? 'Client signed the EPT' : (f.ept.step || (L.siteMeasured(c) ? 'Site measurement done' : 'Waiting for the first site measurement')),
        sent: count(f.ept.log, 'EPT drawing sent to client'), returned: count(f.ept.log, 'Client asked for changes') },
      appliances: { state: f.appliances.signedAt ? 'done' : (f.appliances.items.length || f.appliances.log.length ? 'progress' : 'todo'), items: f.appliances.items.length,
        sent: count(f.appliances.log, 'List sent to client'), returned: count(f.appliances.log, 'Client sent the list back') },
      design: { state: f.design.approvedAt ? 'done' : (L.siteMeasured(c) ? 'progress' : 'todo'),
        sent: count(f.design.log, 'Design sent to client'), returned: count(f.design.log, 'Client returned the design') }
    };
  };
  L.flowLog = function (part, what, note) { part.log.push({ at: Kit.now(), what: what, note: note || '' }); };
  // The money the factory needs: 80% of the total payable, what is in towards it, and what is still short.
  L.productionRow = function (c) { const g = L.gate(c, 'factory'); return { name: 'Production', percent: g.pct, amount: g.need, paid: Math.min(g.got, g.need), due: g.short }; };
  L.collectionDone = function (c) { return L.productionRow(c).due <= 0; };
  L.postStage = function (c) {
    if (c.factoryAt) {
      if (!L.gateOpen(c, 'dispatch')) return 'Factory';
      const d = L.dates(c);
      return d && Kit.today() >= d.handover ? 'Handed over' : 'Dispatch';
    }
    const f = L.flow(c), s = L.flowState(c);
    if (s.ept.state !== 'done') return 'EPT';
    if (s.appliances.state !== 'done') return 'Appliances';
    if (s.design.state !== 'done') return 'Design';
    if (!f.pdi.approvedAt) return 'PDI';
    return 'Accounts go-ahead';
  };
  // Called when Accounts approves the factory gate. With the PDI approved, 80% in and the gate approved,
  // the order is shot to the Factory once, a notice is written, and the factory is emailed (through mail/, if switched on).
  L.toFactory = function (c) {
    const f = L.flow(c);
    if (c.factoryAt || !f.pdi.approvedAt || !L.handed(c) || !L.collectionDone(c) || !L.gateOpen(c, 'factory')) return false;
    c.factoryAt = Kit.now();
    Kit.news(c, 'PDI approved, 80% in and Accounts go-ahead · order shot to the Factory', 'green', 'Accounts');
    const d = L.dates(c), t = L.totals(c);
    const body = ['An order has been shot to the Factory.', '', 'Client: ' + c.name, 'Project: ' + c.pid + '   Customer: ' + c.cid, 'Designer: ' + (c.design.designer || 'not allotted'),
      'Sales manager: ' + (c.sm || (window.People && People.owner ? People.owner(c) : '')), 'PDI approved: ' + Kit.day(f.pdi.approvedAt), 'EPT signed: ' + (f.ept.signedAt ? Kit.day(f.ept.signedAt) : 'not recorded'),
      'Appliance list signed: ' + (f.appliances.signedAt ? Kit.day(f.appliances.signedAt) : 'not recorded'), 'Design approved: ' + (f.design.approvedAt ? Kit.day(f.design.approvedAt) : 'not recorded'),
      'Order value: Rs ' + Kit.commas(t.total), 'Received so far: Rs ' + Kit.commas(L.collected(c)),
      d ? 'Dispatch: ' + Kit.day(d.dispatch) + '   Handover: ' + Kit.day(d.handover) : 'Dates: not set', '', 'Sent by the Magppie CRM.'].join('\n');
    c.factoryMail = { state: 'sending' };
    fetch('/api/mail/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'factory', subject: 'Order shot to Factory: ' + c.name + ' (' + c.pid + ')', body: body }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); }, function () { return { error: 'offline' }; })
      .then(function (out) {
        c.factoryMail = out.sent ? { state: 'sent', to: out.to, at: Kit.now(), test: !!out.test }
          : { state: 'not sent', why: out.error === 'no key' ? 'Email is not switched on yet (mail folder).' : (out.error === 'offline' ? 'Emails are sent from the laptop copy only.' : (out.error || 'It did not go through.')) };
        Kit.store.save();
      });
    return true;
  };

  // Timeline, counted back from the handover date. Dispatch is 30 days before handover. From the Accounts sheet
  // (19 Oct 2026): PDI is 21 days before dispatch and the production drawing (signoff) is 45 days before dispatch
  // (the production days, 45 unless chosen otherwise).
  L.dates = function (c) {
    const t = c.timeline;
    if (!t.handover) return null;
    const dispatch = Kit.addDays(t.handover, -30);
    const pdi = Kit.addDays(dispatch, -21);
    const signoff = Kit.addDays(dispatch, -(Number(t.productionDays) || 45));
    const out = { signoff: signoff, pdi: pdi, dispatch: dispatch, handover: t.handover };
    if (t.type === 'Custom') ['signoff', 'pdi', 'dispatch'].forEach(function (k) { if (t.custom[k]) out[k] = t.custom[k]; });
    return out;
  };

  window.SalesLogic = L;
})();
