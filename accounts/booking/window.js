// Accounts · Booking window: a booking Sales has sent for approval, with everything Accounts needs to check it.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  const fact = A.fact;
  A.bookingWindow = function (c, ctx) {
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
            fact('Billing name', A.billing(c)), fact('Site', c.city + ' · ' + c.product),
            fact('Products', o.products.map(function (p) { return (p.product || 'Product') + ' ' + Kit.money(p.value); }).join(', ')), fact('Installation', Kit.money(o.installation)),
            fact('Offer basic value', Kit.money(t.base)), fact('GST on the bank part', Kit.money(t.tax)),
            fact('Received in bank (due)', Kit.money(t.bank)), fact('Management discount (due)', Kit.money(t.md)),
            fact('Free accessories', Kit.money(t.freight)), fact('Total payable by client', Kit.money(t.total)),
            fact('Payment plan', L.PLANS[c.payment.plan].label + ' · ' + c.approvals.plan), fact('Stage amounts', L.shares(c).map(function (s) { return s.name + ' ' + Kit.money(s.amount); }).join(', ')),
            fact('Confirmed so far', Kit.money(L.collected(c))), fact('Booking amount left', Kit.money(L.bookingLeft(c)) + (c.payment.expectedBy ? ' · by ' + Kit.day(c.payment.expectedBy) : '')),
            fact('Handover', dates ? Kit.day(dates.handover) : ''), fact('Timeline · Design', c.approvals.timeline)),
          h('div', { class: 'line rule' }, h('span', null, 'Signed quotation'), Kit.fileLink(c.id, c.docs.quotation) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'line rule' }, h('span', null, 'Signed drawing'), Kit.fileLink(c.id, c.docs.drawing) || h('span', { class: 'sub' }, 'Not uploaded'))),
        A.decision('b' + c.id, ctx,
          function () {
            ctx.update(function () {
              c.approvals.booking = 'Approved';
              c.approvalNotes = c.approvalNotes || {}; c.approvalNotes.booking = { reason: '', notes: '', at: Kit.now() };
              Kit.news(c, 'Accounts approved the booking', 'green', 'Accounts');
            });
            ctx.close();
          },
          function (why) {
            ctx.update(function () {
              c.approvals.booking = 'Rejected';
              c.approvalNotes = c.approvalNotes || {}; c.approvalNotes.booking = { reason: why.reason, notes: why.notes, at: Kit.now() };
              Kit.news(c, 'Accounts rejected the booking: ' + why.reason, 'red', 'Accounts');
            });
            ctx.close();
          }, 'Approve booking'))]
    };
  };
})();
