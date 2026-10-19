// Shared by Management and by the Sales notification bell.
// What to look for on each client: who has to act, how long it has waited, and what went wrong.
// Every signal is worked out from the saved data. Nothing here is typed in by hand.
(function () {
  const L = SalesLogic;
  const S = {};
  S.LIVE = ['qualified', 'design', 'token', 'booked'];
  S.STAGE = { qualified: 'Qualified', design: 'In design', token: 'Token due', booked: 'Booked' };

  S.value = function (c) {
    if (c.stage === 'design') { const p = c.design.proposals[c.design.proposals.length - 1]; return p ? Number(p.amount) || 0 : 0; }
    return c.stage === 'token' || c.stage === 'booked' || c.stage === 'post' ? L.totals(c).total : 0;
  };

  // The last time anything happened on this client.
  S.lastTouch = function (c) {
    const times = [c.contacts[0] && c.contacts[0].at, c.design.stepAt, c.approvedAt, c.bookedAt, c.spokeAt, c.receivedAt]
      .filter(Boolean).map(function (t) { return new Date(t).getTime(); });
    return Math.max.apply(null, times);
  };

  // Who has to act next: Sales, Design, Client or Accounts. And for how many days.
  S.ball = function (c) {
    const asked = c.payment.receipts.filter(function (r) { return r.status === 'Requested'; })[0];
    if (c.stage === 'qualified') return ['Sales', Kit.daysSince(c.receivedAt)];
    if (c.stage === 'design') {
      const step = c.design.step || 'drf';
      return [step === 'withDesign' ? 'Design' : (step === 'withClient' ? 'Client' : 'Sales'), Kit.daysSince(c.design.stepAt)];
    }
    if (asked) return ['Accounts', Kit.daysSince(asked.requestedAt)];
    if (c.stage === 'token') return ['Sales', Kit.daysSince(c.approvedAt)];
    if (c.approvals.booking === 'Pending') return ['Accounts', Kit.daysSince(c.submittedAt)];
    return ['Sales', Kit.daysSince(c.bookedAt)];
  };

  // Problems on a client. Each is [text, colour, whose problem].
  S.flags = function (c) {
    const out = [];
    const today = Kit.today();
    const fc = L.firstCall(c);
    if (c.stage === 'qualified' && fc.late) out.push(['Not called in 24 hours · ' + Kit.span(fc.hoursLeft) + ' late', 'red', 'Sales']);
    if (c.missed24) out.push(['First conversation came after 24 hours', 'yellow', 'Sales']);
    if (c.retry && new Date(c.retry.dueAt) < new Date()) out.push(['Call-again timer missed', 'red', 'Sales']);
    if (c.nextFollowUp && c.nextFollowUp.slice(0, 10) < today) out.push(['Follow-up overdue · ' + Math.round((new Date(today) - new Date(c.nextFollowUp.slice(0, 10))) / 86400000) + ' day(s)', 'red', 'Sales']);
    if (c.stage === 'design') {
      const step = c.design.step || 'drf';
      const days = Kit.daysSince(c.design.stepAt);
      if (step === 'drf' && days >= 1) out.push(['DRF not sent to Design · ' + days + ' day(s)', 'red', 'Sales']);
      if (step === 'toShare' && days >= 1) out.push(['Proposal from Design not shared · ' + days + ' day(s)', 'red', 'Sales']);
      // The designer is late when the date they promised has passed. With no promise, the date Sales asked for counts.
      const by = c.design.promisedBy || c.design.brief.requiredOn;
      if (step === 'withDesign' && by && by < today) out.push([(c.design.designer ? 'Designer ' + c.design.designer : 'Designer') + ' is late · ' + (c.design.promisedBy ? 'promised ' : 'needed by ') + Kit.day(by).replace(/ \d{4}$/, '') + ' · ' + Math.round((new Date(today) - new Date(by)) / 86400000) + ' day(s)', 'red', 'Design']);
      else if (step === 'withDesign' && days >= 3) out.push(['With Design · ' + days + ' day(s)' + (c.design.designer ? ' · ' + c.design.designer : ''), 'blue', 'Design']);
      if (step === 'withClient' && days >= 3) out.push(['Client silent · ' + days + ' day(s)', 'yellow', 'Client']);
      if (c.design.revisions.length >= 2) out.push(['Revised ' + c.design.revisions.length + ' times, not booked', 'yellow', 'Sales']);
    }
    if (c.stage === 'booked' && !L.tokenIn(c)) {
      const no = c.payment.receipts.filter(function (r) { return r.status === 'Rejected'; }).length;
      const by = c.payment.tokenBy;
      const late = by ? Math.round((new Date(today) - new Date(by)) / 86400000) : Kit.daysSince(c.approvedAt) - 1;
      if (no) out.push(['Accounts rejected the token ' + no + ' time(s)', 'red', 'Sales']);
      else if (!c.payment.receipts.length && late > 0) out.push(['Token ' + late + ' day(s) late', 'red', 'Sales']);
    }
    const asked = c.payment.receipts.filter(function (r) { return r.status === 'Requested' && Kit.daysSince(r.requestedAt) >= 1; })[0];
    if (asked) out.push(['Payment with Accounts · ' + Kit.daysSince(asked.requestedAt) + ' day(s)', 'blue', 'Accounts']);
    if (c.stage === 'booked') {
      if (L.bookingLeft(c) > 0 && c.payment.expectedBy && c.payment.expectedBy < today) out.push(['Booking payment overdue · ' + Kit.money(L.bookingLeft(c)) + ' left', 'red', 'Sales']);
      if (c.approvals.booking === 'Rejected') out.push(['Booking rejected by Accounts', 'red', 'Sales']);
    }
    return out;
  };

  window.Signals = S;
})();
